// ============================================================
// CADASTRO DE FROTA - LOGFLOW BRAVEOLOG
// Backend em Google Apps Script
//
// Conexão: mesma arquitetura usada pelo LogFlow (SiteDash/Site.py) —
// uma única planilha central "Bd_Cadastro", aberta pelo ID a partir
// do servidor (aqui, o próprio Apps Script; lá, uma conta de serviço
// Google com gspread). O navegador nunca acessa a planilha ou o Drive
// diretamente, só troca dados com este script via POST.
//
// Estrutura de pastas criada no Drive para cada cadastro:
//
// PASTA PRINCIPAL (PASTA_DRIVE_ID)
//      └── CNPJ (normalizado, só números)
//            ├── CNPJ                  (Cartão CNPJ)
//            ├── ANTT                  (Foto da ANTT)
//            ├── CNH                   (Foto da CNH)
//            ├── CRLV                  (Foto do CRLV)
//            ├── Comprovante Endereço  (Comprovante de Endereço)
//            └── Certificado Digital   (Certificado Digital)
// ============================================================

// ID da planilha "Bd_Cadastro" (mesma usada pelo LogFlow / GOLOG).
const PLANILHA_ID = '1yhJiEGgeiWQzmr3pDnTBhpjZHnMUvxfSF3QCAp6a5gQ';
const ABA_NOME = 'Bd_Cadastros';

// Um veículo = uma linha. Quando a placa enviada já existe na planilha,
// a linha inteira é sobrescrita com o cadastro novo (o último envio
// sempre prevalece) em vez de gerar uma linha duplicada.
//
// REMOVER_DUPLICADAS trata a bagunça que já está na planilha: se a mesma
// placa aparecer em mais de uma linha, a primeira recebe os dados novos
// e as demais são apagadas, sobrando uma linha por placa. Coloque como
// false para atualizar só a primeira e preservar as antigas.
const REMOVER_DUPLICADAS = true;

// ID da pasta do Google Drive onde os documentos anexados são salvos.
// ATENÇÃO: um ID de pasta do Drive tem, em geral, 33 caracteres. O
// valor abaixo tem 73 — verifique na URL da pasta
// (https://drive.google.com/drive/folders/[ID]) se este ID está
// correto antes de reimplantar; um ID corrompido faz o
// DriveApp.getFolderById falhar ou apontar para o lugar errado.
const PASTA_DRIVE_ID = '1Wh0INeCc_GT-an0inVT2ZMGfHmYZRQYzxY1eSr7LzKJdYsPfbV9gSh6Y6l0Mui18Ma2cnlX3';

// Cabeçalhos das colunas A a Y, na ordem documentada em
// README-DEPLOY.md / CONFIGURACAO-EXEMPLO.md. Renavam e Peso Bruto
// Total são coletados no formulário mas não constavam no layout A-U
// original da planilha — gravados nas colunas V e W para não perder
// esses dados. Certificado Digital e sua senha entraram depois, nas
// colunas X e Y.
const COLUNAS = [
  'Carimbo de data/hora',
  'Nome completo do Responsável CNPJ',
  'Numero CNPJ',
  'Cartão CNPJ',
  'Nome Completo do Motorista',
  'Foto CNH',
  'CPF MOTORISTA',
  'Foto da ANTT do CNPJ',
  'PLACA do Veiculo',
  'Foto do CRLV do Veiculo',
  'Numero da Conta - Digito',
  'Numero da Agencia',
  'Chave Pix',
  'Nome do Banco',
  'Email da Empresa',
  'Comprovante de Endereço',
  'Modelo do Veiculo',
  'OPERAÇÃO',
  'Razão Social Empresa',
  'Telefone para Contato',
  'Inscrição Estadual',
  'Renavam',
  'Peso Bruto Total',
  'Certificado Digital',
  'Senha do Certificado Digital'
];

// Mapa: nome do campo no formulário -> cabeçalho correspondente na
// planilha. Campos de texto simples (não-arquivo).
const MAPA_CAMPOS = {
  carimboDataHora: 'Carimbo de data/hora',
  nomeResponsavel: 'Nome completo do Responsável CNPJ',
  numeroCNPJ: 'Numero CNPJ',
  nomeMotorista: 'Nome Completo do Motorista',
  cpfMotorista: 'CPF MOTORISTA',
  placaVeiculo: 'PLACA do Veiculo',
  numeroConta: 'Numero da Conta - Digito',
  numeroAgencia: 'Numero da Agencia',
  chavePix: 'Chave Pix',
  nomeBanco: 'Nome do Banco',
  emailEmpresa: 'Email da Empresa',
  modeloVeiculo: 'Modelo do Veiculo',
  operacao: 'OPERAÇÃO',
  razaoSocial: 'Razão Social Empresa',
  telefoneContato: 'Telefone para Contato',
  inscricaoEstadual: 'Inscrição Estadual',
  renavam: 'Renavam',
  pesoBrutoTotal: 'Peso Bruto Total',
  senhaCertificado: 'Senha do Certificado Digital'
};

// Mapa: nome do campo de arquivo no formulário -> { subpasta dentro
// da pasta do CNPJ, nome final do arquivo, cabeçalho na planilha }.
const CAMPOS_ARQUIVO = {
  cartaoCNPJ: { pasta: 'CNPJ', nome: 'Cartão CNPJ', coluna: 'Cartão CNPJ' },
  fotoANTT: { pasta: 'ANTT', nome: 'ANTT', coluna: 'Foto da ANTT do CNPJ' },
  fotoCNH: { pasta: 'CNH', nome: 'CNH', coluna: 'Foto CNH' },
  fotoCRLV: { pasta: 'CRLV', nome: 'CRLV', coluna: 'Foto do CRLV do Veiculo' },
  comprovanteEndereco: {
    pasta: 'Comprovante Endereço',
    nome: 'Comprovante Endereço',
    coluna: 'Comprovante de Endereço'
  },
  certificadoDigital: {
    pasta: 'Certificado Digital',
    nome: 'Certificado Digital',
    coluna: 'Certificado Digital',
    opcional: true
  }
};

// ============================================================
// RECEBER ENVIO DO FORMULÁRIO
// ============================================================

function doPost(e) {
  // Dois envios simultâneos da mesma placa poderiam ler a planilha antes
  // de qualquer um dos dois gravar e acabar criando duas linhas. O lock
  // serializa a leitura + gravação.
  const trava = LockService.getScriptLock();

  try {
    trava.waitLock(30000);
  } catch (erro) {
    return respostaJson({
      success: false,
      message: 'O servidor está processando outro cadastro. Tente novamente em alguns segundos.'
    });
  }

  try {
    const dados = e.parameter;

    const planilha = SpreadsheetApp.openById(PLANILHA_ID);
    const aba = planilha.getSheetByName(ABA_NOME);

    if (!aba) {
      throw new Error(`Aba "${ABA_NOME}" não encontrada na planilha`);
    }

    garantirCabecalho(aba);

    const linkPorCampo = uploadArquivos(e, dados.numeroCNPJ);
    const linha = prepararLinha(dados, linkPorCampo);
    const gravacao = gravarLinha(aba, linha, dados.placaVeiculo);

    return respostaJson({
      success: true,
      atualizado: gravacao.atualizado,
      linhaPlanilha: gravacao.linha
    });
  } catch (erro) {
    return respostaJson({ success: false, message: erro.message });
  } finally {
    trava.releaseLock();
  }
}

// ============================================================
// GRAVAR NA PLANILHA (sobrescreve a linha da placa, se existir)
// ============================================================

function gravarLinha(aba, linha, placa) {
  const placaNormalizada = normalizarPlaca(placa);

  // Sem placa não há como identificar o cadastro: grava como novo.
  const existentes = placaNormalizada
    ? localizarLinhasPorPlaca(aba, placaNormalizada)
    : [];

  if (!existentes.length) {
    aba.appendRow(linha);

    return { atualizado: false, linha: aba.getLastRow() };
  }

  const alvo = existentes[0];

  aba.getRange(alvo, 1, 1, linha.length).setValues([linha]);

  if (REMOVER_DUPLICADAS && existentes.length > 1) {
    // De baixo para cima: apagar uma linha desloca as de baixo.
    existentes
      .slice(1)
      .sort((a, b) => b - a)
      .forEach(numeroLinha => aba.deleteRow(numeroLinha));
  }

  return { atualizado: true, linha: alvo };
}

// Devolve os números das linhas cuja placa é a informada, em ordem.
function localizarLinhasPorPlaca(aba, placaNormalizada) {
  const ultimaLinha = aba.getLastRow();

  if (ultimaLinha < 2) {
    return [];
  }

  const coluna = obterColunaPlaca(aba);
  const valores = aba.getRange(2, coluna, ultimaLinha - 1, 1).getValues();
  const linhas = [];

  valores.forEach((valor, indice) => {
    if (normalizarPlaca(valor[0]) === placaNormalizada) {
      linhas.push(indice + 2); // +2: a leitura começa na linha 2
    }
  });

  return linhas;
}

// A planilha em produção usa títulos um pouco diferentes dos de COLUNAS
// (ex.: "Foto da CNH do Motorista"), então a coluna da placa é achada
// pelo cabeçalho que contém "PLACA"; COLUNAS é só o plano B.
function obterColunaPlaca(aba) {
  const totalColunas = aba.getLastColumn();

  if (totalColunas) {
    const cabecalhos = aba.getRange(1, 1, 1, totalColunas).getValues()[0];

    for (let i = 0; i < cabecalhos.length; i++) {
      if (cabecalhos[i].toString().toUpperCase().indexOf('PLACA') !== -1) {
        return i + 1;
      }
    }
  }

  return COLUNAS.indexOf('PLACA do Veiculo') + 1;
}

// ABC-1D23, abc1d23 e "ABC 1D23" são a mesma placa.
function normalizarPlaca(placa) {
  if (placa === null || placa === undefined) {
    return '';
  }

  return placa.toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// ============================================================
// UPLOAD DOS ANEXOS PARA O DRIVE
//
// Os anexos chegam do formulário como texto base64, em três campos por
// documento: <campo>_base64, <campo>_nome e <campo>_tipo. Esse desvio
// existe porque o Apps Script não entrega, no doPost, os arquivos de um
// multipart/form-data como Blob utilizável — o campo vem sem conteúdo,
// o upload era pulado e sobrava só a pasta do CNPJ vazia.
//
// O envio multipart continua aceito como alternativa, caso o campo
// chegue mesmo como Blob.
// ============================================================

function uploadArquivos(e, numeroCNPJ) {
  if (!numeroCNPJ) {
    throw new Error('O CNPJ não foi informado no formulário.');
  }

  const cnpjNormalizado = numeroCNPJ.toString().replace(/\D/g, '');

  if (!cnpjNormalizado) {
    throw new Error('O CNPJ informado é inválido.');
  }

  const pastaPrincipal = obterPastaPrincipal();
  const pastaCNPJ = obterOuCriarPasta(pastaPrincipal, cnpjNormalizado);
  const links = {};
  const faltando = [];

  Object.keys(CAMPOS_ARQUIVO).forEach(campo => {
    const config = CAMPOS_ARQUIVO[campo];
    const arquivo = obterBlob(e, campo, config.nome);

    if (!arquivo) {
      Logger.log('Anexo não recebido: ' + campo);
      if (!config.opcional) {
        faltando.push(config.nome);
      }
      return;
    }

    const pastaArquivo = obterOuCriarPasta(pastaCNPJ, config.pasta);
    const extensao = obterExtensao(arquivo.getName());

    const salvo = pastaArquivo.createFile(arquivo);
    salvo.setName(config.nome + extensao);

    // Domínios do Workspace podem bloquear o link público; nesse caso o
    // arquivo continua salvo, só acessível a quem tem acesso à pasta.
    try {
      salvo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (erro) {
      Logger.log('Não foi possível liberar o link de ' + campo + ': ' + erro.message);
    }

    links[campo] = salvo.getUrl();
  });

  // Os anexos obrigatórios (todos menos o Certificado Digital) precisam
  // chegar. Falhar aqui é melhor do que gravar a linha na planilha
  // apontando para o vazio.
  if (faltando.length) {
    throw new Error(
      'Os anexos a seguir não chegaram ao servidor: ' + faltando.join(', ')
      + '. Reenvie o formulário; se persistir, verifique se a implantação '
      + 'do Apps Script está na versão mais recente.'
    );
  }

  return links;
}

// Monta o Blob do anexo a partir dos campos em base64 e, como
// alternativa, do campo multipart cru.
function obterBlob(e, campo, nomePadrao) {
  const conteudo = e.parameter[campo + '_base64'];

  if (conteudo && typeof conteudo === 'string') {
    const tipo = e.parameter[campo + '_tipo'] || 'application/octet-stream';
    const nome = e.parameter[campo + '_nome'] || nomePadrao;

    return Utilities.newBlob(Utilities.base64Decode(conteudo), tipo, nome);
  }

  const bruto = e.parameter[campo];

  if (bruto && typeof bruto.getBytes === 'function') {
    return bruto;
  }

  return null;
}

// ============================================================
// PASTA PRINCIPAL DO DRIVE
// ============================================================

function obterPastaPrincipal() {
  try {
    return DriveApp.getFolderById(PASTA_DRIVE_ID);
  } catch (erro) {
    throw new Error(
      'A pasta do Drive configurada em PASTA_DRIVE_ID não pôde ser aberta. '
      + 'Confira o ID na URL da pasta (drive.google.com/drive/folders/[ID]). '
      + 'Detalhe: ' + erro.message
    );
  }
}

// ============================================================
// OBTER OU CRIAR PASTA
// ============================================================

function obterOuCriarPasta(pastaPai, nomePasta) {
  const pastas = pastaPai.getFoldersByName(nomePasta);

  if (pastas.hasNext()) {
    return pastas.next();
  }

  return pastaPai.createFolder(nomePasta);
}

// ============================================================
// OBTER EXTENSÃO DO ARQUIVO
// ============================================================

function obterExtensao(nomeArquivo) {
  if (!nomeArquivo) {
    return '';
  }

  const partes = nomeArquivo.split('.');

  return partes.length > 1 ? '.' + partes[partes.length - 1] : '';
}

// ============================================================
// GARANTIR CABEÇALHO (cria apenas se a linha 1 estiver vazia)
// ============================================================

function garantirCabecalho(aba) {
  const primeiraLinha = aba.getRange(1, 1, 1, COLUNAS.length).getValues()[0];
  const temCabecalho = primeiraLinha.some(valor => valor !== '');

  if (!temCabecalho) {
    aba.getRange(1, 1, 1, COLUNAS.length).setValues([COLUNAS]);
  }
}

// ============================================================
// MONTAR LINHA NA ORDEM DE COLUNAS
// ============================================================

function prepararLinha(dados, linkPorCampo) {
  const linha = {};

  Object.keys(MAPA_CAMPOS).forEach(campo => {
    linha[MAPA_CAMPOS[campo]] = dados[campo] || '';
  });

  Object.keys(CAMPOS_ARQUIVO).forEach(campo => {
    linha[CAMPOS_ARQUIVO[campo].coluna] = linkPorCampo[campo] || '';
  });

  return COLUNAS.map(cabecalho => linha[cabecalho] || '');
}

// ============================================================
// RESPOSTA JSON
// ============================================================

function respostaJson(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// TESTE DE CONFIGURAÇÃO
// ============================================================

function testarConfiguracao() {
  const planilha = SpreadsheetApp.openById(PLANILHA_ID);
  const aba = planilha.getSheetByName(ABA_NOME);

  if (!aba) {
    Logger.log(`ERRO: aba "${ABA_NOME}" não encontrada`);
    return;
  }

  garantirCabecalho(aba);
  Logger.log(`OK: aba "${ABA_NOME}" encontrada (${aba.getLastRow()} linhas)`);

  try {
    const pasta = DriveApp.getFolderById(PASTA_DRIVE_ID);
    Logger.log(`OK: pasta do Drive encontrada ("${pasta.getName()}")`);
  } catch (erro) {
    Logger.log(`ERRO: PASTA_DRIVE_ID inválido — confira o ID na URL da pasta (${erro.message})`);
  }
}

// ============================================================
// TESTE DE ACESSO VIA GET (retorna status ao abrir a URL)
// ============================================================

function doGet() {
  return respostaJson({
    status: 'OK',
    message: 'Script funcionando corretamente',
    versao: '4.2 - Atualização por placa'
  });
}
