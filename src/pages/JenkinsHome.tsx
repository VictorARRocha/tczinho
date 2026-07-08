import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { PlayCircle, RefreshCcw, ChevronRight, Server } from "lucide-react";
import { JenkinsHistory } from "@/components/JenkinsHistory";

export default function JenkinsHome() {
  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-10 animate-fade-in">
      <div className="mb-6 sm:mb-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-primary mb-3">
          <Server className="h-3 w-3" />
          Jenkins
        </div>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">
          Disparar execuções no <span className="gradient-text">Jenkins</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-3xl">
          Crie solicitações que o <strong>JenkinsBridge</strong> local consome e envia ao pipeline.
          A Lovable nunca chama o Jenkins diretamente.
        </p>
      </div>

      <div className="grid gap-4 sm:gap-5 sm:grid-cols-2 mb-8 sm:mb-10">
        <JenkinsCard
          to="/jenkins/rodagem-completa"
          icon={<PlayCircle className="h-8 w-8" />}
          title="Rodagem completa"
          description="Iniciar uma nova rodagem completa ou por módulo no Jenkins."
        />
        <JenkinsCard
          to="/jenkins/reexecutar"
          icon={<RefreshCcw className="h-8 w-8" />}
          title="Reexecutar rodagens"
          description="Selecionar casos quebrados de uma rodagem já analisada e enviar novamente ao Jenkins."
        />
      </div>

      <JenkinsHistory />
    </div>
  );
}



function JenkinsCard({ to, icon, title, description }: {
  to: string; icon: React.ReactNode; title: string; description: string;
}) {
  return (
    <Link to={to} className="group">
      <Card className="glass-card p-6 sm:p-8 h-full transition-all hover:border-primary/50 hover:shadow-lg hover:-translate-y-0.5">
        <div className="flex flex-col items-center text-center gap-3">
          <div className="rounded-2xl bg-gradient-primary p-4 text-primary-foreground glow-primary">
            {icon}
          </div>
          <h2 className="text-xl font-bold tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground max-w-md">{description}</p>
          <div className="mt-2 inline-flex items-center gap-1 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
            Abrir <ChevronRight className="h-3.5 w-3.5" />
          </div>
        </div>
      </Card>
    </Link>
  );
}
