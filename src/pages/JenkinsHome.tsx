import { Link } from "react-router-dom";
import { PlayCircle, RefreshCcw, ChevronRight } from "lucide-react";
import { JenkinsHistory } from "@/components/JenkinsHistory";

export default function JenkinsHome() {
  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-10 animate-fade-in">
      {/* So o titulo e os atalhos (decisao anterior: sem selo e sem texto de apoio). */}
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Disparar execuções no Jenkins</h1>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <JenkinsAction
          to="/jenkins/rodagem-completa"
          icon={<PlayCircle className="h-5 w-5" />}
          title="Rodagem completa"
          description="Nova rodagem de um módulo inteiro, agora ou agendada."
        />
        <JenkinsAction
          to="/jenkins/reexecutar"
          icon={<RefreshCcw className="h-5 w-5" />}
          title="Reexecutar rodagens"
          description="Escolha casos quebrados ou com diferença e rode de novo."
        />
      </div>

      <div className="mt-10">
        <JenkinsHistory title="Execuções recentes" limit={20} defaultExpanded />
      </div>
    </div>
  );
}

function JenkinsAction({ to, icon, title, description }: {
  to: string; icon: React.ReactNode; title: string; description: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-4 rounded-lg border border-border bg-card p-4 transition-smooth hover:border-primary/50 hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-muted-foreground">{description}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
    </Link>
  );
}
