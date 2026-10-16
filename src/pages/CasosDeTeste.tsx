// Casos de teste (menu lateral): primeiro escolhe o modulo, depois a arvore do .mds daquele modulo.
// E so a lista dos casos atuais: o que falhou fica nas abas da rodagem.
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { IconeModulo } from "@/components/IconeModulo";
import { useModulos } from "@/hooks/use-permissao";
import { gruposDeSistema } from "@/lib/permissoes";
import { useHierarchy, useModules } from "@/services/queries";
import { CasosTab } from "@/pages/module/CasosTab";

export default function CasosDeTeste() {
  const { slug } = useParams();
  return slug ? <CasosDoModulo slug={slug} /> : <EscolherModulo />;
}

function EscolherModulo() {
  const { data: modulos = [], isLoading } = useModules();
  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-10 animate-fade-in">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Casos de teste</h1>
        <p className="mt-2 text-sm text-muted-foreground">Escolha o módulo para ver os casos cadastrados no projeto do TestComplete.</p>
      </div>
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="aspect-square rounded-lg" />)}
        </div>
      ) : modulos.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">Você não tem acesso a nenhum módulo. Peça a um administrador.</Card>
      ) : (
        <div className="space-y-6">
          {gruposDeSistema(modulos).map((grupo) => (
            <section key={grupo.titulo} aria-labelledby={`grupo-${grupo.titulo}`}>
              <h2 id={`grupo-${grupo.titulo}`} className="mb-3 text-sm font-semibold text-muted-foreground">{grupo.titulo}</h2>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {grupo.modulos.map((m) => (
                  <li key={m.id}>
                    <Link
                      to={`/casos-de-teste/${m.slug}`}
                      className="group flex aspect-square flex-col overflow-hidden rounded-lg border border-border bg-card transition-[border-color,transform] duration-150 ease-out-strong hover:border-primary/60 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="flex flex-1 items-center justify-center text-primary transition-transform duration-200 ease-out-strong group-hover:scale-105" aria-hidden>
                        <IconeModulo slug={m.slug} className="h-14 w-14 sm:h-16 sm:w-16" />
                      </span>
                      <span className="border-t border-border bg-muted/50 px-2 py-2 text-center text-sm font-semibold">{m.nome}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function CasosDoModulo({ slug }: { slug: string }) {
  const { data: modulos = [] } = useModules();
  const pode = useModulos().pode(slug);
  const modulo = modulos.find((m) => m.slug === slug);
  const { data: hierarquia = [], isLoading } = useHierarchy(pode ? slug : "");

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-10 animate-fade-in">
      <Link to="/casos-de-teste" className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground md:min-h-0 md:py-1">
        <ChevronLeft className="h-4 w-4" aria-hidden /> Casos de teste
      </Link>
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <IconeModulo slug={slug} className="h-7 w-7" />
        </span>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{modulo?.nome || slug}</h1>
      </div>

      {!pode ? (
        <Card className="p-10 text-center">
          <Lock className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Você não tem acesso a este módulo. Peça a um administrador.</p>
        </Card>
      ) : isLoading ? (
        <div className="space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
      ) : (
        <CasosTab moduloSlug={slug} hierarchy={hierarquia} />
      )}
    </div>
  );
}
