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
    coluna: 'Certificado Digital'
  }
};

// ============================================================
// RECEBER ENVIO DO FORMULÁRIO
// ============================================================

function doPost(e) {
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

    aba.appendRow(linha);

    return respostaJson({ success: true });
  } catch (erro) {
    return respostaJson({ success: false, message: erro.message });
  }
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
      faltando.push(config.nome);
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

  // Todos os seis anexos são obrigatórios no formulário. Falhar aqui é
  // melhor do que gravar a linha na planilha apontando para o vazio.
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
    versao: '4.1 - Certificado Digital'
  });
}
