# 📝 Exemplo de Configuração

## Google Apps Script

### Encontrar ID da Planilha

1. Abra sua planilha no Google Sheets.
2. Olhe a URL no navegador:

   ```text
   https://docs.google.com/spreadsheets/d/1yhJiEGgeiWQzmr3pDnTBhpjZHnMUvxfSF3QCAp6a5gQ/edit
   ```

3. O ID é a parte entre `/d/` e `/edit`:

   ```text
   1yhJiEGgeiWQzmr3pDnTBhpjZHnMUvxfSF3QCAp6a5gQ
   ```

### Encontrar ID da Pasta do Drive

1. Abra a pasta no Google Drive.
2. Olhe a URL no navegador:

   ```text
   https://drive.google.com/drive/folders/1abcdefGHIJKLMNOPqrstuvWXYZ123456
   ```

3. O ID é a parte após `/folders/`:

   ```text
   1abcdefGHIJKLMNOPqrstuvWXYZ123456
   ```

### Configuração no google-apps-script.gs

O `PLANILHA_ID` e o `ABA_NOME` já vêm preenchidos com os valores reais
da planilha "Bd_Cadastro" (mesma usada pelo LogFlow e pelo GOLOG). Só
falta o `PASTA_DRIVE_ID`:

```javascript
// Já preenchido no arquivo
const PLANILHA_ID = '1yhJiEGgeiWQzmr3pDnTBhpjZHnMUvxfSF3QCAp6a5gQ';
const ABA_NOME = 'Bd_Cadastros';

// Substitua pelo ID real da sua pasta de anexos
const PASTA_DRIVE_ID = '1abcdefGHIJKLMNOPqrstuvWXYZ123456';
```

---

## JavaScript Frontend

### Encontrar URL do Apps Script

1. No Google Apps Script, após implantar como “Aplicativo da Web”.
2. Copie a URL mostrada:

   ```text
   https://script.google.com/macros/s/AKfycbzXXXXXXXXXXXXXXXXXXXXXXXXXXX/exec
   ```

### Configuração no cadastro-frota.js

```javascript
// ANTES (valor de exemplo)
const APPS_SCRIPT_URL = 'SUA_URL_DO_GOOGLE_APPS_SCRIPT_AQUI';

// DEPOIS (com sua URL real)
const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbzXXXXXXXXXXXXXXXXXXXXXXXXXXX/exec';
```

---

## Estrutura da Planilha

### Aba: Bd_Cadastros

Certifique-se de que a aba tem este nome exato, incluindo o caractere de sublinhado.

### Cabeçalhos da primeira linha

A primeira linha da planilha deve ter estes cabeçalhos na ordem:

| A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P | Q | R | S | T | U | V | W | X | Y | Z | AA | AB |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Carimbo de data/hora | Nome completo do Responsável CNPJ | Numero CNPJ | Cartão CNPJ | Nome Completo do Motorista | Foto CNH | CPF MOTORISTA | Foto da ANTT do CNPJ | PLACA do Veiculo | Foto do CRLV do Veiculo | Numero da Conta - Digito | Numero da Agencia | Chave Pix | Nome do Banco | Email da Empresa | Comprovante de Endereço | Modelo do Veiculo | OPERAÇÃO | Razão Social Empresa | Telefone para Contato | Inscrição Estadual | Renavam | Peso Bruto Total | Certificado Digital | Senha do Certificado Digital | Tipo de Eixo | Segunda Placa | Filial |

**IMPORTANTE:** O Google Apps Script criará os cabeçalhos automaticamente na primeira execução, caso eles não existam.

---

## Exemplo Completo

### Passo 1: Planilha

```text
Nome: Bd_Cadastro
URL: https://docs.google.com/spreadsheets/d/1yhJiEGgeiWQzmr3pDnTBhpjZHnMUvxfSF3QCAp6a5gQ/edit
ID: 1yhJiEGgeiWQzmr3pDnTBhpjZHnMUvxfSF3QCAp6a5gQ

Aba: Bd_Cadastros
```

### Passo 2: Pasta Drive

```text
Nome: Anexos Cadastro Frota
URL: https://drive.google.com/drive/folders/1abcdefGHIJKLMNOPqrstuvWXYZ123456
ID: 1abcdefGHIJKLMNOPqrstuvWXYZ123456
```

### Passo 3: Apps Script

```javascript
// No arquivo google-apps-script.gs
const PLANILHA_ID = '1yhJiEGgeiWQzmr3pDnTBhpjZHnMUvxfSF3QCAp6a5gQ';
const ABA_NOME = 'Bd_Cadastros';
const PASTA_DRIVE_ID = '1abcdefGHIJKLMNOPqrstuvWXYZ123456';
```

### Passo 4: Implantar Apps Script

```text
URL gerada: https://script.google.com/macros/s/AKfycbzXXXXXXXXXXXXXXXXXXXXXXXXXXX/exec
```

### Passo 5: Frontend

```javascript
// No arquivo cadastro-frota.js
const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbzXXXXXXXXXXXXXXXXXXXXXXXXXXX/exec';
```

---

## Checklist Rápido

Antes de fazer o deploy, verifique:

- [ ] Criou a planilha “Bd_Cadastro” no Google Sheets.
- [ ] Criou ou renomeou a aba para “Bd_Cadastros”.
- [ ] Copiou o ID da planilha corretamente.
- [ ] Criou a pasta no Google Drive para os anexos.
- [ ] Copiou o ID da pasta do Drive corretamente.
- [ ] Colou os IDs no arquivo `google-apps-script.gs`.
- [ ] Executou a função `testarConfiguracao()` com sucesso.
- [ ] Implantou o Apps Script como “Aplicativo da Web”.
- [ ] Copiou a URL do Apps Script.
- [ ] Colou a URL no arquivo `cadastro-frota.js`.
- [ ] Fez o deploy na Vercel ou GitHub.
- [ ] Testou o formulário com dados reais.

---

## Dicas

### URLs sempre com `/exec` no final

A URL do Apps Script deve terminar com `/exec`:

```text
✅ CORRETO: https://script.google.com/macros/s/AKfycby.../exec
❌ ERRADO:  https://script.google.com/macros/s/AKfycby.../dev
```

### Permissões do Drive

Os arquivos ficarão visíveis para qualquer pessoa com o link. Para alterar essa configuração, localize no `google-apps-script.gs`:

```javascript
arquivo.setSharing(
  DriveApp.Access.ANYONE_WITH_LINK,
  DriveApp.Permission.VIEW
);
```

Para tornar os arquivos privados:

```javascript
arquivo.setSharing(
  DriveApp.Access.PRIVATE,
  DriveApp.Permission.VIEW
);
```

### Reimplantar o Apps Script

Se fizer alterações no código do Apps Script:

1. Clique em “Implantar” > “Gerenciar implantações”.
2. Clique no ícone de lápis ao lado da implantação ativa.
3. Na versão, selecione “Nova versão”.
4. Clique em “Implantar”.
5. A URL permanece a mesma.

---

## URLs de Teste

### Testar o Apps Script diretamente

Cole a URL do seu Apps Script no navegador:

```text
https://script.google.com/macros/s/AKfycby.../exec
```

Deve retornar:

```json
{
  "status": "OK",
  "message": "Script funcionando corretamente",
  "versao": "1.0"
}