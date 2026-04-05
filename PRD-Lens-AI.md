# Product Requirements Document (PRD): Lens AI

## 1. Visão Geral do Produto
**Lens AI** é uma extensão agnóstica para Visual Studio Code (VS Code) projetada para fornecer clareza e controle sobre a fragmentação de configurações de Inteligência Artificial. Como uma "lente" de diagnóstico, ela consolida e visualiza a hierarquia de configurações (Global, Workspace e Folder) e arquivos de regras específicas (.cursorrules, .clinerules, etc.) em uma interface unificada.

### 1.1. Problema
Com a proliferação de ferramentas (Copilot, Cursor, Continue, Cline), as configurações de IA tornaram-se fragmentadas. Desenvolvedores e Arquitetos de Software frequentemente enfrentam dificuldades para entender qual modelo, temperatura ou instrução de contexto está sendo efetivamente aplicada em um determinado escopo.

### 1.2. Público-Alvo
Arquitetos de Software, Líderes Técnicos e Desenvolvedores que utilizam múltiplas ferramentas de IA ou gerenciam políticas de IA em nível de projeto/empresa.

---

## 2. Objetivos e Escopo Técnico

### 2.1. Objetivos Principais
* **Discovery:** Mapear automaticamente as extensões de IA instaladas e seus estados.
* **Hierarchy Visualization:** Resolver a precedência de configurações ("quem sobrescreve quem").
* **Context Auditing:** Centralizar a visualização de arquivos de instruções e regras.
* **Security Check:** Alertar sobre chaves de API expostas em arquivos de texto plano.

### 2.2. Escopo de Compatibilidade Inicial (Agnóstico)
A extensão deve suportar a inspeção dos seguintes namespaces e arquivos:
* **Engines:** GitHub Copilot, Continue.dev, Cline, Codeium.
* **Rules/Instructions:** `.cursorrules`, `.clinerules`, `.github/copilot-instructions.md`, `.instructions.md`.

---

## 3. Especificações de Interface (UI/UX)

### 3.1. Primary Sidebar (Hierarchy Tree View)
Localizada na barra lateral esquerda, organizada em três nós principais:
* **Active Engines:** Lista de extensões de IA detectadas e seus modelos ativos.
* **Effective Configs:** Árvore de propriedades (ex: `model`, `temperature`, `maxTokens`) com indicadores de escopo:
    * `[U]` - User (Global)
    * `[W]` - Workspace
    * `[F]` - Folder (Multi-root)
* **Instruction Files:** Lista de arquivos de regras detectados no diretório raiz e subdiretórios.

### 3.2. Scope Matrix (Main Webview)
Uma aba central no editor que exibe uma tabela de comparação detalhada:
* **Colunas:** Property, Default, User (Global), Workspace, Effective Value.
* **Estilo Visual:** Valores sobrescritos devem aparecer com `text-decoration: line-through` e opacidade reduzida. O **Effective Value** deve ser destacado com a cor de acento do projeto (Ciano/Azul vibrante).

---

## 4. Requisitos Funcionais

### 4.1. Config Resolver
O motor da extensão deve utilizar a API nativa `vscode.workspace.getConfiguration(namespace).inspect(key)` para extrair:
* `defaultValue`
* `globalValue`
* `workspaceValue`
* `workspaceFolderValue`

### 4.2. Security Scanner
Implementar um scanner passivo que busca por padrões de strings (Regex) compatíveis com chaves de API (ex: OpenAI `sk-...`, Anthropic `sk-ant-...`) em arquivos `.json`, `.env` ou `.yaml` que não estejam protegidos pelo `.gitignore`.

### 4.3. Navigation
Ao clicar em qualquer valor na TreeView ou na Matrix, a extensão deve abrir o arquivo de configuração correspondente (`settings.json` ou arquivo de regras) na linha exata da definição.

---

## 5. Arquitetura de Software Sugerida

* **`src/extension.ts`**: Registro de comandos e ativação.
* **`src/providers/TreeDataProvider.ts`**: Lógica de construção da árvore lateral.
* **`src/providers/WebviewProvider.ts`**: Gerenciamento do painel central e comunicação via `postMessage`.
* **`src/services/ConfigInspector.ts`**: Serviço agnóstico para varredura de namespaces de terceiros.
* **`src/utils/SecurityScanner.ts`**: Utilitários de detecção de segredos.

---

## 6. Identidade Visual (Conceito Lens AI)
* **Nome:** Lens AI
* **Paleta de Cores:** Fundo escuro (VS Code Native), acentos em Ciano (#00FFFF) e Azul Cobalto.
* **Metáfora Visual:** Camadas sobrepostas (Layers) sendo atravessadas por uma lente que foca no ponto de convergência dos dados.

---

## 7. Critérios de Aceite para o MVP
1.  A extensão deve listar pelo menos o modelo ativo do GitHub Copilot e do Continue.dev.
2.  A Matrix deve mostrar claramente quando uma configuração de Workspace está vencendo uma Global.
3.  O usuário deve ser capaz de abrir um arquivo `.cursorrules` diretamente pela sidebar da extensão.
4.  Nenhum dado de configuração deve ser enviado para servidores externos (Privacidade Local).
