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
//            └── Comprovante Endereço  (Comprovante de Endereço)
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

// Cabeçalhos das colunas A a W, na ordem documentada em
// README-DEPLOY.md / CONFIGURACAO-EXEMPLO.md. Renavam e Peso Bruto
// Total são coletados no formulário mas não constavam no layout A-U
// original da planilha — gravados nas colunas V e W para não perder
// esses dados.
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
  'Peso Bruto Total'
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
  pesoBrutoTotal: 'Peso Bruto Total'
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
// Em requisições multipart/form-data, o Apps Script entrega campos de
// arquivo em e.parameter[nomeDoCampo] já como Blob (não como string).
// e.parameters[nomeDoCampo] (plural) NÃO é confiável para arquivos —
// era esse o bug que fazia todo upload ser pulado (arquivo.getBytes
// nunca existia em e.parameters[campo][0]), deixando só a pasta do
// CNPJ vazia, sem nenhuma subpasta/arquivo dentro.
// ============================================================

function uploadArquivos(e, numeroCNPJ) {
  if (!numeroCNPJ) {
    throw new Error('O CNPJ não foi informado no formulário.');
  }

  const cnpjNormalizado = numeroCNPJ.toString().replace(/\D/g, '');

  if (!cnpjNormalizado) {
    throw new Error('O CNPJ informado é inválido.');
  }

  const pastaPrincipal = DriveApp.getFolderById(PASTA_DRIVE_ID);
  const pastaCNPJ = obterOuCriarPasta(pastaPrincipal, cnpjNormalizado);
  const links = {};

  Object.keys(CAMPOS_ARQUIVO).forEach(campo => {
    const arquivo = e.parameter[campo];

    if (!arquivo || typeof arquivo.getBytes !== 'function') {
      Logger.log('Arquivo não enviado: ' + campo);
      return;
    }

    const config = CAMPOS_ARQUIVO[campo];
    const pastaArquivo = obterOuCriarPasta(pastaCNPJ, config.pasta);
    const extensao = obterExtensao(arquivo.getName());

    const salvo = pastaArquivo.createFile(arquivo);
    salvo.setName(config.nome + extensao);
    salvo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    links[campo] = salvo.getUrl();
  });

  return links;
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
    versao: '3.0 - Pastas por CNPJ (corrigido)'
  });
}
