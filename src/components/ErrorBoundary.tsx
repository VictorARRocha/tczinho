import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface Props {
  children: ReactNode;
  /** Texto curto de onde o erro aconteceu, exibido na mensagem. */
  area?: string;
  /** Quando muda (ex.: rota), um erro exibido e limpo sem remontar os filhos. */
  resetKey?: unknown;
}

interface State {
  error: Error | null;
}

/**
 * Segura erros de renderizacao de uma area da tela. Sem isto, qualquer erro
 * em um componente desmonta o app inteiro e o usuario ve uma tela branca.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", this.props.area || "app", error, info.componentStack);
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) this.reset();
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-3xl p-6 lg:p-10">
        <Card className="glass-card p-10 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold">Algo deu errado {this.props.area ? `em ${this.props.area}` : "nesta tela"}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            O restante do sistema continua funcionando. Tente de novo; se o erro persistir, recarregue a página.
          </p>
          <p className="mt-3 font-mono text-xs text-muted-foreground break-all">{this.state.error.message}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button onClick={this.reset}>
              <RefreshCw className="h-4 w-4 mr-2" /> Tentar novamente
            </Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Recarregar página
            </Button>
          </div>
        </Card>
      </div>
    );
  }
}
