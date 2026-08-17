// ============================================================
// CADASTRO DE FROTA - LOGFLOW BRAVEOLOG
// Backend em Google Apps Script
//
// Conexão: mesma arquitetura usada pelo LogFlow (SiteDash/Site.py) —
// uma única planilha central "Bd_Cadastro", aberta pelo ID a partir
// do servidor (aqui, o próprio Apps Script; lá, uma conta de serviço
// Google com gspread). O navegador nunca acessa a planilha ou o Drive
// diretamente, só troca dados com este script via POST.
// ============================================================

// ID da planilha "Bd_Cadastro" (mesma usada pelo LogFlow / GOLOG).
const PLANILHA_ID = '1yhJiEGgeiWQzmr3pDnTBhpjZHnMUvxfSF3QCAp6a5gQ';
const ABA_NOME = 'Bd_Cadastros';

// ID da pasta do Google Drive onde os documentos anexados são salvos.
// Edite antes de implantar — veja CONFIGURACAO-EXEMPLO.md.
const PASTA_DRIVE_ID = 'ID_DA_PASTA_DO_DRIVE';

// Cabeçalhos das colunas A a U, na ordem documentada em
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
// planilha. Campos de arquivo apontam para o mesmo cabeçalho que
// recebe o link do Drive.
const MAPA_CAMPOS = {
  nomeResponsavel: 'Nome completo do Responsável CNPJ',
  razaoSocial: 'Razão Social Empresa',
  numeroCNPJ: 'Numero CNPJ',
  inscricaoEstadual: 'Inscrição Estadual',
  emailEmpresa: 'Email da Empresa',
  telefoneContato: 'Telefone para Contato',
  nomeMotorista: 'Nome Completo do Motorista',
  cpfMotorista: 'CPF MOTORISTA',
  placaVeiculo: 'PLACA do Veiculo',
  modeloVeiculo: 'Modelo do Veiculo',
  renavam: 'Renavam',
  pesoBrutoTotal: 'Peso Bruto Total',
  nomeBanco: 'Nome do Banco',
  numeroAgencia: 'Numero da Agencia',
  numeroConta: 'Numero da Conta - Digito',
  chavePix: 'Chave Pix',
  operacao: 'OPERAÇÃO',
  carimboDataHora: 'Carimbo de data/hora'
};

const CAMPOS_ARQUIVO = {
  cartaoCNPJ: 'Cartão CNPJ',
  fotoANTT: 'Foto da ANTT do CNPJ',
  fotoCNH: 'Foto CNH',
  fotoCRLV: 'Foto do CRLV do Veiculo',
  comprovanteEndereco: 'Comprovante de Endereço'
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

    const linkPorCampo = uploadArquivos(e);
    const linha = prepararLinha(dados, linkPorCampo);

    aba.appendRow(linha);

    return respostaJson({ success: true });
  } catch (erro) {
    return respostaJson({ success: false, message: erro.message });
  }
}

// ============================================================
// UPLOAD DOS ANEXOS PARA O DRIVE
// Em multipart/form-data, o Apps Script entrega campos de arquivo em
// e.parameter[nomeDoCampo] já como Blob (não como string) — por isso
// a checagem por getBytes() abaixo, em vez de e.files (que não existe
// na API do Apps Script).
// Retorna { nomeCampo: urlDoArquivo }
// ============================================================

function uploadArquivos(e) {
  const pasta = DriveApp.getFolderById(PASTA_DRIVE_ID);
  const links = {};

  Object.keys(CAMPOS_ARQUIVO).forEach(campo => {
    const arquivo = e.parameter[campo];

    if (!arquivo || typeof arquivo.getBytes !== 'function') {
      return;
    }

    const salvo = pasta.createFile(arquivo);

    salvo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    links[campo] = salvo.getUrl();
  });

  return links;
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
    linha[CAMPOS_ARQUIVO[campo]] = linkPorCampo[campo] || '';
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
    Logger.log(`ERRO: PASTA_DRIVE_ID inválido — configure antes de implantar (${erro.message})`);
  }
}

// ============================================================
// TESTE DE ACESSO VIA GET (retorna status ao abrir a URL)
// ============================================================

function doGet() {
  return respostaJson({
    status: 'OK',
    message: 'Script funcionando corretamente',
    versao: '1.0'
  });
}
