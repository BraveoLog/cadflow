# LOGFLOW - Cadastro de Frota

## Índice

1. [Visão Geral](#visão-geral)
2. [Conexão com a planilha](#conexão-com-a-planilha-mesma-arquitetura-do-logflow)
3. [Configuração do Google Apps Script](#configuração-do-google-apps-script)
4. [Configuração do Frontend](#configuração-do-frontend)
5. [Deploy na Vercel](#deploy-na-vercel)
6. [Testando o Sistema](#testando-o-sistema)
7. [Estrutura dos Arquivos](#estrutura-dos-arquivos)

---

## Visão Geral

### O que este sistema faz

- Formulário web sem login para cadastro de frota.
- Validações completas de CNPJ, CPF, placa, email e outros campos.
- Máscaras automáticas nos campos.
- Upload de documentos para o Google Drive.
- Inserção automática na planilha do Google Sheets.
- Uma linha por placa: se a placa enviada já existe na planilha, a
  linha inteira é sobrescrita com o cadastro novo, valendo sempre o
  último envio (ver "Atualização por placa").
- Layout corporativo, sem gradientes e sem ícones/emoji.
- Responsivo, funcionando em desktop e dispositivos móveis.

### Tecnologias utilizadas

- **Frontend:** HTML, CSS e JavaScript puro, sem frameworks.
- **Backend:** Google Apps Script.
- **Armazenamento:** Google Sheets e Google Drive.
- **Deploy:** Vercel, GitHub Pages ou Netlify.

---

## Conexão com a planilha (mesma arquitetura do LogFlow)

O LogFlow (`SiteDash/Site.py`) conecta no Google Sheets assim: uma
conta de serviço Google autentica no servidor (Python + `gspread`) e
abre a planilha **"Bd_Cadastro"** por ID (`conectar_bd_cadastro()`),
lendo e gravando as abas por nome. O navegador do usuário nunca toca a
planilha ou o Drive diretamente.

O Cadflow segue a mesma lógica, só que o "servidor" é o próprio
Google Apps Script: `SpreadsheetApp.openById(PLANILHA_ID)` abre a
mesma planilha central, e o formulário só conversa com esse script via
`fetch` POST.

```text
Navegador (form) → fetch POST → Apps Script → SpreadsheetApp.openById(PLANILHA_ID)
                                            → DriveApp (upload dos anexos)
```

O ID já está preenchido em `google-apps-script.gs`
(`PLANILHA_ID = '1yhJiEGgeiWQzmr3pDnTBhpjZHnMUvxfSF3QCAp6a5gQ'`), o
mesmo `BD_CADASTRO_URL` usado pelo LogFlow e pelo GOLOG. Só o
`PASTA_DRIVE_ID` (pasta de anexos) precisa ser configurado — veja o
Passo 2 abaixo.

---

## Configuração do Google Apps Script

### Passo 1: Conferir a planilha e a aba

A planilha **"Bd_Cadastro"** e a aba **"Bd_Cadastros"** já existem e já
estão configuradas em `google-apps-script.gs`. Só confirme que o ID
usado no script corresponde à sua cópia da planilha:

```text
https://docs.google.com/spreadsheets/d/[ID_DA_PLANILHA]/edit
```

### Passo 2: Criar pasta no Google Drive

1. Acesse o [Google Drive](https://drive.google.com).
2. Crie uma pasta chamada "Anexos Cadastro Frota".
3. Abra a pasta e copie o ID da URL:

   ```text
   https://drive.google.com/drive/folders/[ID_DA_PASTA]
   ```

### Passo 3: Criar o Google Apps Script

1. Acesse o [Google Apps Script](https://script.google.com).
2. Clique em "Novo projeto".
3. Cole o conteúdo do arquivo `google-apps-script.gs`.
4. Edite apenas a pasta do Drive no início do código:

   ```javascript
   const PASTA_DRIVE_ID = 'ID_DA_PASTA_DO_DRIVE';
   ```

5. Renomeie o projeto para "Cadastro Frota Backend".

### Passo 4: Testar a configuração

1. No editor do Apps Script, selecione a função `testarConfiguracao`.
2. Clique em "Executar".
3. Autorize o script quando solicitado.
4. Verifique os logs em "Ver" > "Registros" — deve confirmar a aba
   `Bd_Cadastros` e a pasta do Drive.

### Passo 5: Implantar como Web App

1. No Apps Script, clique em "Implantar" > "Nova implantação".
2. Clique no ícone de engrenagem ao lado de "Selecione o tipo".
3. Escolha "Aplicativo da Web".
4. Configure:
   - **Descrição:** "API Cadastro Frota".
   - **Executar como:** "Eu", seu email.
   - **Quem tem acesso:** "Qualquer pessoa".
5. Clique em "Implantar".
6. Copie a URL gerada, semelhante a:

   ```text
   https://script.google.com/macros/s/SEU_ID/exec
   ```

### Passo 6: Republicar sempre que o `.gs` mudar

Salvar o código no editor **não** atualiza a URL `/exec`: o Web App
continua servindo a última *versão implantada*. Depois de colar uma
nova versão de `google-apps-script.gs`:

1. "Implantar" > "Gerenciar implantações".
2. No lápis (editar), em **Versão** escolha "Nova versão".
3. "Implantar". A URL `/exec` continua a mesma.

Para conferir qual versão está no ar, abra a URL `/exec` no navegador:
o `doGet` responde com o campo `versao`. O código atual desta pasta é
a versão `4.2 - Atualização por placa`; se a URL responder outra coisa,
a implantação está atrasada.

---

## Atualização por placa

A placa é a chave do cadastro. No `doPost`, antes de gravar, o script
procura a placa enviada na coluna "PLACA do Veiculo":

- **Placa nova:** a linha é acrescentada no fim da planilha, como antes.
- **Placa já cadastrada:** a linha existente é sobrescrita por inteiro
  com os dados do envio novo — carimbo de data/hora, links dos anexos e
  todos os demais campos. A posição da linha na planilha não muda.
- **Placa repetida em várias linhas** (duplicadas antigas): a primeira
  recebe os dados novos e as demais são apagadas, sobrando uma linha por
  placa. Para desligar essa limpeza e apenas atualizar a primeira, mude
  `REMOVER_DUPLICADAS` para `false` no topo do `.gs`.

A comparação ignora maiúsculas/minúsculas e pontuação, então `ABC-1D23`,
`abc1d23` e `ABC 1D23` são a mesma placa.

Os anexos continuam sendo gravados no Drive a cada envio, na pasta do
CNPJ. Um recadastro da mesma placa cria arquivos novos e a planilha passa
a apontar para eles; os arquivos antigos permanecem no Drive (não são
apagados, porque a pasta é por CNPJ e pode conter documentos de outros
veículos da mesma empresa).

O `doPost` roda sob `LockService`, para que dois envios simultâneos da
mesma placa não criem duas linhas.

---

## Configuração do Frontend

Abra o arquivo `cadastro-frota.js` e encontre:

```javascript
const APPS_SCRIPT_URL = 'SUA_URL_DO_GOOGLE_APPS_SCRIPT_AQUI';
```

Substitua pela URL copiada no passo anterior. Salve o arquivo.

---

## Deploy na Vercel

### Opção 1: Deploy via GitHub

No terminal, dentro da pasta do projeto:

```bash
git init
git add .
git commit -m "Initial commit - Cadastro Frota LogFlow"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/cadastro-frota.git
git push -u origin main
```

1. Acesse a [Vercel](https://vercel.com).
2. Faça login com sua conta do GitHub.
3. Clique em "New Project".
4. Importe o repositório "cadastro-frota".
5. Configure:
   - **Framework Preset:** Other.
   - **Build Command:** deixe vazio.
   - **Output Directory:** deixe vazio.
6. Clique em "Deploy".

### Opção 2: Deploy direto, sem Git

1. Acesse a [Vercel](https://vercel.com).
2. Clique em "New Project".
3. Selecione a aba "Import Third-Party Git Repository", ou arraste a
   pasta do projeto para a área de upload.
4. Siga as mesmas configurações da Opção 1.

---

## Testando o Sistema

### 1. Testar o formulário

1. Acesse a URL do seu site na Vercel.
2. Preencha todos os campos obrigatórios.
3. Anexe arquivos de teste.
4. Clique em "Enviar Cadastro".

### 2. Verificar se funcionou

**Na planilha:**

- Abra a planilha "Bd_Cadastro", aba "Bd_Cadastros".
- Deve aparecer uma nova linha com os dados preenchidos.
- As colunas de arquivos devem conter links para o Drive.

**No Drive:**

- Abra a pasta de anexos configurada em `PASTA_DRIVE_ID`.
- Devem estar presentes os seis arquivos enviados: Cartão CNPJ, CNH,
  ANTT, CRLV, comprovante de endereço e certificado digital.

### 3. Testar as validações

Tente enviar o formulário com CNPJ inválido, CPF inválido, placa fora
do padrão, email inválido, ou sem anexar arquivos — cada caso deve
mostrar um erro específico.

---

## Estrutura dos Arquivos

```text
Cadflow/
├── cadastro-frota.html        # Estrutura HTML do formulário
├── cadastro-frota.css         # Layout corporativo, sem gradiente/emoji
├── cadastro-frota.js          # Validações, máscaras e envio
├── google-apps-script.gs      # Backend + upload dos anexos ao Drive
└── README-DEPLOY.md           # Este arquivo
```

---

## Campos do Formulário

### Dados da Empresa

- Nome Completo do Responsável CNPJ.
- Razão Social Empresa.
- Número CNPJ, com validação e máscara automática.
- Inscrição Estadual, apenas números.
- Email da Empresa, com validação.
- Telefone para Contato, com máscara automática.
- Cartão CNPJ, em upload.
- Foto da ANTT, em upload.
- Comprovante de Endereço, em upload.
- Certificado Digital, em upload (.pfx, .p12, imagem ou PDF).
- Senha do Certificado Digital, texto livre.

### Dados do Motorista

- Nome Completo do Motorista.
- CPF do Motorista, com validação e máscara automática.
- Foto da CNH, em upload.

### Dados do Veículo

- Placa do Veículo, com validação para formato antigo ou Mercosul.
- Modelo do Veículo.
- Renavam, 9 a 11 dígitos.
- Peso Bruto Total, entre 0 e 20.000 kg.
- Foto do CRLV, em upload.

### Dados Bancários

- Nome do Banco.
- Número da Agência, apenas números.
- Número da Conta - Dígito, no formato `00000-0`.
- Chave Pix.

### Operação

- Operação.

> Renavam e Peso Bruto Total não faziam parte do layout de colunas A-U
> originalmente documentado para `Bd_Cadastros`; para não perder esses
> dados coletados no formulário, `google-apps-script.gs` grava-os nas
> colunas V e W. Certificado Digital e Senha do Certificado Digital
> foram acrescentados depois e vão para as colunas X e Y. Tipo de Eixo
> (CAVALO/REBOQUE, só preenchido quando o Modelo do Veículo é CARRETA)
> e Segunda Placa (só preenchida quando o Tipo de Eixo é REBOQUE) vão
> para as colunas Z e AA.

---

## Segurança

### O que o sistema não faz

- Não exibe os dados preenchidos no site para quem preenche.
- Não permite visualizar cadastros anteriores.
- Não possui área de login ou autenticação.

### O que o sistema faz

- Envia os dados diretamente para o Google Sheets.
- Permite que apenas quem tem acesso à planilha veja os dados.
- Armazena os arquivos no Drive com permissão de visualização por link.
- Executa validações no cliente e no servidor.

---

## Personalizações

### Alterar cores

Edite o arquivo `cadastro-frota.css`, na seção `:root`
(`--c-brand`, `--c-brand-soft`, `--c-success-text`, etc.).

### Adicionar campos

1. **HTML:** adicione o campo ao formulário.
2. **JavaScript:** adicione máscara ou validação, se necessário.
3. **Apps Script:** inclua o campo em `MAPA_CAMPOS` (ou
   `CAMPOS_ARQUIVO`, se for upload) e adicione o cabeçalho
   correspondente em `COLUNAS`.

---

## Troubleshooting

### Erro: "Erro ao enviar o cadastro"

**Possíveis causas:**

1. URL do Apps Script incorreta no `cadastro-frota.js`.
2. Apps Script não autorizado corretamente.
3. `PASTA_DRIVE_ID` incorreto.

**Solução:** verifique os logs do Apps Script em "Ver" > "Registros" e
execute novamente `testarConfiguracao()`.

### Arquivos não aparecem no Drive

**Causa:** permissões insuficientes.

**Solução:**

1. No Apps Script, vá em "Configurações do projeto".
2. Marque "Mostrar arquivo de manifesto `appsscript.json`".
3. Adicione ao manifesto:

```json
{
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file"
  ]
}
```

### Validações não funcionam

**Causa:** o JavaScript não está carregando.

**Solução:** abra o Console do navegador com F12, verifique erros de
carregamento e confirme que todos os arquivos estão no mesmo diretório.

---

## Licença

Este projeto foi desenvolvido para uso interno da BRAVEOLOG.
