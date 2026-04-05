Prompt para Gerar a Extensão Lens AI
"Aja como um Engenheiro de Software Sênior especialista em extensões do VS Code. Baseado no PRD do projeto Lens AI, gere o código completo seguindo as instruções abaixo:

1. Metadados do Projeto
Nome: Lens AI

Publisher: thomasswarch

ID: lens-ai

Descrição: 'Agnostic configuration & scope inspector for GitHub Copilot, Cursor, and LLMs.'

2. Estrutura de Arquivos Requerida
Gere o conteúdo para os seguintes arquivos:

package.json: Com todos os activationEvents, contributes.views (na barra lateral: lens-engines, lens-configs, lens-rules) e o comando lens.openMatrix.

src/extension.ts: Ponto de entrada que registra os TreeDataProviders e o WebviewPanel.

src/treeProviders.ts: Implementação da classe LensTreeProvider que usa vscode.workspace.getConfiguration().inspect() para extrair a hierarquia de configurações (Global vs Workspace).

src/configScanner.ts: Lógica agnóstica para identificar configurações de: github.copilot, continue, cline e detectar arquivos .cursorrules ou .clinerules.

src/webviewProvider.ts: Gerador de HTML/CSS para a 'Scope Matrix'.

3. Requisitos de Lógica e UI
Hierarquia: A lógica deve identificar claramente se um valor vem de globalValue, workspaceValue ou workspaceFolderValue.

Visual da Webview: Crie uma tabela moderna usando CSS Grid. Use a paleta de cores do logo (Ciano e Azul Vibrante) para destacar o 'Effective Value'. Valores sobrescritos devem ter text-decoration: line-through e opacidade 0.5.

Segurança: Inclua uma função simples de Regex que detecta padrões de chaves de API (como sk-...) em arquivos de configuração e exibe um alerta de segurança na TreeView.

Agnosticismo: Garanta que a extensão procure por namespaces de múltiplas IAs sem depender de APIs privadas delas.

4. Estilo de Código
Use TypeScript estrito.

Siga o padrão de separação de responsabilidades (Providers vs Services).

O código deve estar pronto para ser compilado e empacotado via vsce."
