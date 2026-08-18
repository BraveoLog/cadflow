// ============================================================
// CADASTRO DE FROTA - LOGFLOW BRAVEOLOG
// JavaScript para validações, máscaras e envio
// ============================================================

// IMPORTANTE: substitua esta URL pela URL do seu Google Apps Script
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwbtljgwwm0leyrnLXOY3Hi_VMayrhN_fHcIEfJR_qiCJroACGX81HT0fLX5UjELPVGSg/exec';

// Campos de arquivo do formulário, na mesma nomenclatura usada pelo
// backend (CAMPOS_ARQUIVO em google-apps-script.gs).
const CAMPOS_ARQUIVO = [
  'cartaoCNPJ',
  'fotoANTT',
  'fotoCNH',
  'fotoCRLV',
  'comprovanteEndereco'
];

// Limite por anexo. O Apps Script recusa POSTs muito grandes e o
// base64 ainda infla o conteúdo em cerca de 33%.
const TAMANHO_MAXIMO_ARQUIVO = 8 * 1024 * 1024;

// ============================================================
// PREPARO DOS ANEXOS
//
// O Apps Script não entrega, no doPost, os arquivos de um
// multipart/form-data como Blob utilizável: os campos de arquivo
// chegam sem conteúdo e o upload é pulado silenciosamente — era isso
// que deixava a pasta do CNPJ criada, porém vazia, sem nenhuma
// subpasta ou documento dentro.
//
// Por isso cada arquivo é lido aqui e enviado como texto em três
// campos (<campo>_base64, <campo>_nome e <campo>_tipo). O backend
// remonta o arquivo com Utilities.newBlob.
// ============================================================

function lerArquivoBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const resultado = String(reader.result);
      const separador = resultado.indexOf(',');

      resolve(separador === -1 ? '' : resultado.slice(separador + 1));
    };

    reader.onerror = () => {
      reject(erroDoUsuario(`Não foi possível ler o arquivo "${file.name}".`));
    };

    reader.readAsDataURL(file);
  });
}

// Erro cuja mensagem pode ser mostrada ao usuário (diferente de uma
// falha de rede genérica).
function erroDoUsuario(mensagem) {
  const erro = new Error(mensagem);

  erro.doUsuario = true;

  return erro;
}

async function prepararAnexos(form, formData) {
  for (const campo of CAMPOS_ARQUIVO) {
    // Remove o arquivo bruto: o conteúdo vai em base64 e enviar as
    // duas versões só dobraria o tamanho do POST.
    formData.delete(campo);

    const input = form.querySelector(`#${campo}`);
    const file = input && input.files ? input.files[0] : null;

    if (!file) {
      continue;
    }

    if (file.size > TAMANHO_MAXIMO_ARQUIVO) {
      throw erroDoUsuario(
        `O arquivo "${file.name}" tem ${formatBytes(file.size)} e passa do ` +
        `limite de ${formatBytes(TAMANHO_MAXIMO_ARQUIVO)} por anexo.`
      );
    }

    const conteudo = await lerArquivoBase64(file);

    if (!conteudo) {
      throw erroDoUsuario(
        `O arquivo "${file.name}" chegou vazio. Selecione o arquivo novamente.`
      );
    }

    formData.append(`${campo}_base64`, conteudo);
    formData.append(`${campo}_nome`, file.name);
    formData.append(`${campo}_tipo`, file.type || 'application/octet-stream');
  }
}

// ============================================================
// MÁSCARAS E VALIDAÇÕES
// ============================================================

// Aplicar máscara de CNPJ: 00.000.000/0000-00
function mascaraCNPJ(valor) {
  return valor
    .replace(/\D/g, '')
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
    .slice(0, 18);
}

// Aplicar máscara de CPF: 000.000.000-00
function mascaraCPF(valor) {
  return valor
    .replace(/\D/g, '')
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2')
    .slice(0, 14);
}

// Aplicar máscara de telefone: (00) 00000-0000
function mascaraTelefone(valor) {
  valor = valor.replace(/\D/g, '');

  if (valor.length <= 10) {
    return valor
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }

  return valor
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2')
    .slice(0, 15);
}

// Aplicar máscara de conta bancária: 00000-0
function mascaraConta(valor) {
  valor = valor.replace(/\D/g, '');

  if (valor.length > 1) {
    const digito = valor.slice(-1);
    const numero = valor.slice(0, -1);

    return `${numero}-${digito}`;
  }

  return valor;
}

// Validar CNPJ
function validarCNPJ(cnpj) {
  cnpj = cnpj.replace(/\D/g, '');

  if (cnpj.length !== 14) return false;
  if (/^(\d)\1+$/.test(cnpj)) return false;

  let tamanho = cnpj.length - 2;
  let numeros = cnpj.substring(0, tamanho);
  let digitos = cnpj.substring(tamanho);
  let soma = 0;
  let pos = tamanho - 7;

  for (let i = tamanho; i >= 1; i--) {
    soma += numeros.charAt(tamanho - i) * pos--;

    if (pos < 2) {
      pos = 9;
    }
  }

  let resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);

  if (resultado != digitos.charAt(0)) {
    return false;
  }

  tamanho += 1;
  numeros = cnpj.substring(0, tamanho);
  soma = 0;
  pos = tamanho - 7;

  for (let i = tamanho; i >= 1; i--) {
    soma += numeros.charAt(tamanho - i) * pos--;

    if (pos < 2) {
      pos = 9;
    }
  }

  resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);

  return resultado == digitos.charAt(1);
}

// Validar CPF
function validarCPF(cpf) {
  cpf = cpf.replace(/\D/g, '');

  if (cpf.length !== 11) return false;
  if (/^(\d)\1+$/.test(cpf)) return false;

  let soma = 0;

  for (let i = 0; i < 9; i++) {
    soma += parseInt(cpf.charAt(i)) * (10 - i);
  }

  let resto = soma % 11;
  let digito1 = resto < 2 ? 0 : 11 - resto;

  if (digito1 != cpf.charAt(9)) {
    return false;
  }

  soma = 0;

  for (let i = 0; i < 10; i++) {
    soma += parseInt(cpf.charAt(i)) * (11 - i);
  }

  resto = soma % 11;
  const digito2 = resto < 2 ? 0 : 11 - resto;

  return digito2 == cpf.charAt(10);
}

// Validar placa (formato antigo ou Mercosul)
function validarPlaca(placa) {
  placa = placa
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  // Formato antigo: AAA0000
  const regexAntigo = /^[A-Z]{3}[0-9]{4}$/;

  // Formato Mercosul: AAA0A00
  const regexMercosul = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;

  return regexAntigo.test(placa) || regexMercosul.test(placa);
}

// Validar Renavam: apenas números, 9 a 11 dígitos
function validarRenavam(renavam) {
  const digitos = renavam.replace(/\D/g, '');

  return /^\d{9,11}$/.test(digitos);
}

// Validar Peso Bruto Total: número inteiro entre 0 e 20.000
function validarPesoBruto(peso) {
  const digitos = String(peso).replace(/\D/g, '');

  if (!digitos) {
    return false;
  }

  const valor = parseInt(digitos, 10);

  return valor >= 0 && valor <= 20000;
}

// Aplicar máscara de peso com separador de milhar: 20.000
function mascaraPeso(valor) {
  let digitos = valor.replace(/\D/g, '').slice(0, 5);

  if (!digitos) {
    return '';
  }

  // Limita ao teto de 20.000 kg
  if (parseInt(digitos, 10) > 20000) {
    digitos = '20000';
  }

  return digitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Validar email
function validarEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  return regex.test(email);
}

// ============================================================
// APLICAR MÁSCARAS NOS INPUTS
// ============================================================

document.addEventListener('DOMContentLoaded', function () {
  const form = document.getElementById('cadastroForm');

  // CNPJ
  const cnpjInput = document.getElementById('numeroCNPJ');

  cnpjInput.addEventListener('input', function (e) {
    e.target.value = mascaraCNPJ(e.target.value);
  });

  // CPF
  const cpfInput = document.getElementById('cpfMotorista');

  cpfInput.addEventListener('input', function (e) {
    e.target.value = mascaraCPF(e.target.value);
  });

  // Telefone
  const telefoneInput = document.getElementById('telefoneContato');

  telefoneInput.addEventListener('input', function (e) {
    e.target.value = mascaraTelefone(e.target.value);
  });

  // Conta bancária
  const contaInput = document.getElementById('numeroConta');

  contaInput.addEventListener('input', function (e) {
    const valor = e.target.value.replace(/\D/g, '');

    if (valor.length > 0) {
      e.target.value = mascaraConta(valor);
    }
  });

  // Agência: apenas números
  const agenciaInput = document.getElementById('numeroAgencia');

  agenciaInput.addEventListener('input', function (e) {
    e.target.value = e.target.value.replace(/\D/g, '');
  });

  // Inscrição estadual: apenas números, com opção de isenção
  const ieInput = document.getElementById('inscricaoEstadual');
  const ieIsentoInput = document.getElementById('ieIsento');

  ieInput.addEventListener('input', function (e) {
    e.target.value = e.target.value.replace(/\D/g, '');
  });

  ieIsentoInput.addEventListener('change', function (e) {
    const isento = e.target.checked;

    ieInput.readOnly = isento;
    ieInput.required = !isento;
    ieInput.value = isento ? 'ISENTO' : '';
    ieInput.classList.remove('invalid', 'valid');

    const formGroup = ieInput.closest('.form-group');

    formGroup.classList.remove('has-error');

    const errorMsg = formGroup.querySelector('.error-message');

    if (errorMsg) {
      errorMsg.remove();
    }
  });

  // Placa: letras maiúsculas e números
  const placaInput = document.getElementById('placaVeiculo');

  placaInput.addEventListener('input', function (e) {
    e.target.value = e.target.value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 7);
  });

  // Renavam: apenas números
  const renavamInput = document.getElementById('renavam');

  renavamInput.addEventListener('input', function (e) {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 11);
  });

  // Peso Bruto Total: apenas números, teto de 20.000
  const pesoInput = document.getElementById('pesoBrutoTotal');

  pesoInput.addEventListener('input', function (e) {
    e.target.value = mascaraPeso(e.target.value);
  });

  // Selects: feedback visual ao escolher
  const selects = document.querySelectorAll('.form-group select');

  selects.forEach(select => {
    select.addEventListener('change', function (e) {
      e.target.classList.toggle('valid', Boolean(e.target.value));
      e.target.classList.remove('invalid');
    });
  });

  // Mostrar nome do arquivo selecionado
  const fileInputs = document.querySelectorAll('input[type="file"]');

  fileInputs.forEach(input => {
    input.addEventListener('change', function (e) {
      const fileGroup = e.target.closest('.file-group');
      const fileName = fileGroup.querySelector('.file-name');

      if (e.target.files.length > 0) {
        const file = e.target.files[0];

        fileName.textContent =
          `Arquivo: ${file.name} (${formatBytes(file.size)})`;

        fileGroup.classList.add('has-file');
      } else {
        fileName.textContent = '';
        fileGroup.classList.remove('has-file');
      }
    });
  });

  // Validação em tempo real
  cnpjInput.addEventListener('blur', function (e) {
    validarCampo(e.target, validarCNPJ, 'CNPJ inválido');
  });

  cpfInput.addEventListener('blur', function (e) {
    validarCampo(e.target, validarCPF, 'CPF inválido');
  });

  const emailInput = document.getElementById('emailEmpresa');

  emailInput.addEventListener('blur', function (e) {
    validarCampo(e.target, validarEmail, 'Email inválido');
  });

  placaInput.addEventListener('blur', function (e) {
    validarCampo(
      e.target,
      validarPlaca,
      'Placa inválida. Use AAA0000 ou AAA0A00'
    );
  });

  renavamInput.addEventListener('blur', function (e) {
    validarCampo(
      e.target,
      validarRenavam,
      'Renavam inválido. Informe de 9 a 11 dígitos'
    );
  });

  pesoInput.addEventListener('blur', function (e) {
    validarCampo(
      e.target,
      validarPesoBruto,
      'Peso Bruto Total deve estar entre 0 e 20.000 kg'
    );
  });

  // Envio do formulário
  form.addEventListener('submit', handleSubmit);
});

// ============================================================
// VALIDAÇÃO DE CAMPO INDIVIDUAL
// ============================================================

function validarCampo(input, validador, mensagemErro) {
  const valor = input.value;
  const formGroup = input.closest('.form-group');

  // Remove mensagem de erro anterior
  let errorMsg = formGroup.querySelector('.error-message');

  if (errorMsg) {
    errorMsg.remove();
  }

  formGroup.classList.remove('has-error');
  input.classList.remove('invalid', 'valid');

  if (!valor) {
    return;
  }

  if (validador(valor)) {
    input.classList.add('valid');
  } else {
    input.classList.add('invalid');
    formGroup.classList.add('has-error');

    errorMsg = document.createElement('span');
    errorMsg.className = 'error-message';
    errorMsg.textContent = mensagemErro;

    formGroup.appendChild(errorMsg);
  }
}

// ============================================================
// FORMATAR BYTES
// ============================================================

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) {
    return '0 Bytes';
  }

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

// ============================================================
// ENVIO DO FORMULÁRIO
// ============================================================

async function handleSubmit(e) {
  e.preventDefault();

  const form = e.target;
  const btnSubmit = document.getElementById('btnSubmit');
  const btnText = btnSubmit.querySelector('.btn-text');
  const btnLoader = btnSubmit.querySelector('.btn-loader');
  const messageBox = document.getElementById('messageBox');

  // Validar todos os campos
  let valido = true;
  const erros = [];

  // Validar CNPJ
  const cnpj = document.getElementById('numeroCNPJ').value;

  if (!validarCNPJ(cnpj)) {
    erros.push('CNPJ inválido');
    valido = false;
  }

  // Validar CPF
  const cpf = document.getElementById('cpfMotorista').value;

  if (!validarCPF(cpf)) {
    erros.push('CPF do motorista inválido');
    valido = false;
  }

  // Validar email
  const email = document.getElementById('emailEmpresa').value;

  if (!validarEmail(email)) {
    erros.push('Email da empresa inválido');
    valido = false;
  }

  // Validar placa
  const placa = document.getElementById('placaVeiculo').value;

  if (!validarPlaca(placa)) {
    erros.push('Placa do veículo inválida. Use AAA0000 ou AAA0A00');
    valido = false;
  }

  // Validar conta bancária
  const conta = document.getElementById('numeroConta').value;

  if (!/^\d+-\d$/.test(conta)) {
    erros.push('Número da conta deve estar no formato: 00000-0');
    valido = false;
  }

  // Validar agência
  const agencia = document.getElementById('numeroAgencia').value;

  if (!/^\d+$/.test(agencia)) {
    erros.push('Agência deve conter apenas números');
    valido = false;
  }

  // Validar inscrição estadual (dispensada quando marcado como isento)
  const ie = document.getElementById('inscricaoEstadual').value;
  const ieIsento = document.getElementById('ieIsento').checked;

  if (!ieIsento && !/^\d+$/.test(ie)) {
    erros.push(
      'Inscrição Estadual deve conter apenas números (ou marque "CNPJ isento")'
    );
    valido = false;
  }

  // Validar Renavam
  const renavam = document.getElementById('renavam').value;

  if (!validarRenavam(renavam)) {
    erros.push('Renavam inválido. Informe de 9 a 11 dígitos');
    valido = false;
  }

  // Validar Peso Bruto Total
  const peso = document.getElementById('pesoBrutoTotal').value;

  if (!validarPesoBruto(peso)) {
    erros.push('Peso Bruto Total deve ser um número entre 0 e 20.000 kg');
    valido = false;
  }

  // Validar campos de seleção
  const selecoes = [
    ['modeloVeiculo', 'Selecione o Modelo do Veículo'],
    ['operacao', 'Selecione a OPERAÇÃO']
  ];

  for (const [id, mensagem] of selecoes) {
    const select = document.getElementById(id);

    if (!select.value) {
      select.classList.add('invalid');
      erros.push(mensagem);
      valido = false;
    }
  }

  // Verificar arquivos obrigatórios
  const arquivosObrigatorios = [
    'cartaoCNPJ',
    'fotoANTT',
    'fotoCNH',
    'fotoCRLV',
    'comprovanteEndereco'
  ];

  for (const id of arquivosObrigatorios) {
    const input = document.getElementById(id);

    if (!input.files || input.files.length === 0) {
      erros.push(`O campo "${input.labels[0].textContent}" é obrigatório`);
      valido = false;
    }
  }

  if (!valido) {
    mostrarMensagem(
      'error',
      'Erros no formulário:<br>' + erros.join('<br>')
    );

    return;
  }

  // Desabilitar botão e mostrar carregamento
  btnSubmit.disabled = true;
  btnText.style.display = 'none';
  btnLoader.style.display = 'inline-block';
  messageBox.style.display = 'none';

  try {
    // Preparar FormData
    const formData = new FormData(form);

    // Adicionar carimbo de data/hora
    const agora = new Date();

    const dataHora = agora.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    formData.append('carimboDataHora', dataHora);

    // Peso vai para a planilha como número puro (sem separador de milhar)
    formData.set('pesoBrutoTotal', peso.replace(/\D/g, ''));

    // Converter os anexos para base64 (ver prepararAnexos)
    await prepararAnexos(form, formData);

    // Enviar para o Google Apps Script
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (result.success) {
      mostrarMensagem(
        'success',
        'Cadastro enviado com sucesso. Em breve entraremos em contato.'
      );

      form.reset();

      // Limpar estados de validação
      form.querySelectorAll('.valid, .invalid').forEach(campo => {
        campo.classList.remove('valid', 'invalid');
      });

      form.querySelectorAll('.has-error').forEach(grupo => {
        grupo.classList.remove('has-error');
      });

      form.querySelectorAll('.error-message').forEach(msg => msg.remove());

      // Resetar indicadores visuais dos arquivos
      document.querySelectorAll('.file-group').forEach(group => {
        group.classList.remove('has-file');

        const fileName = group.querySelector('.file-name');

        if (fileName) {
          fileName.textContent = '';
        }
      });

      // Rolar para o topo
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    } else {
      // Falha de validação do servidor — mostra a mensagem exata
      // devolvida pelo backend.
      mostrarMensagem(
        'error',
        result.message || 'Não foi possível enviar o cadastro.'
      );
    }
  } catch (error) {
    console.error('Erro:', error);

    mostrarMensagem(
      'error',
      error && error.doUsuario
        ? error.message
        : 'Erro ao enviar o cadastro. Por favor, tente novamente. ' +
          'Se o problema persistir, entre em contato conosco.'
    );
  } finally {
    // Reabilitar botão
    btnSubmit.disabled = false;
    btnText.style.display = 'inline';
    btnLoader.style.display = 'none';
  }
}

// ============================================================
// EXIBIR MENSAGEM
// ============================================================

function mostrarMensagem(tipo, mensagem) {
  const messageBox = document.getElementById('messageBox');
  const rotulo = tipo === 'success' ? 'Sucesso' : 'Erro';

  messageBox.className = `message-box ${tipo}`;
  messageBox.innerHTML =
    `<span class="tag">${rotulo}</span>${mensagem}`;
  messageBox.style.display = 'block';

  // Rolar para a mensagem
  messageBox.scrollIntoView({
    behavior: 'smooth',
    block: 'nearest'
  });

  // Ocultar após 8 segundos, apenas para sucesso
  if (tipo === 'success') {
    setTimeout(() => {
      messageBox.style.display = 'none';
    }, 8000);
  }
}