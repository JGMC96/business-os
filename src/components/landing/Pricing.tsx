import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Check, Sparkles } from "lucide-react";

const plans = [
  {
    name: "Free",
    description: "Para probar y empezar",
    price: "0",
    period: "siempre",
    features: [
      "1 negocio",
      "Hasta 50 clientes",
      "Facturación básica",
      "Dashboard simple",
      "Asesor IA limitado",
    ],
    cta: "Comenzar gratis",
    variant: "outline" as const,
    popular: false,
  },
  {
    name: "Pro",
    description: "Para negocios en crecimiento",
    price: "29",
    period: "/mes",
    features: [
      "1 negocio",
      "Clientes ilimitados",
      "Todos los módulos",
      "Dashboard avanzado",
      "Asesor IA completo",
      "Soporte prioritario",
      "Exportar datos",
    ],
    cta: "Iniciar prueba gratis",
    variant: "hero" as const,
    popular: true,
  },
  {
    name: "Business",
    description: "Para equipos y múltiples negocios",
    price: "79",
    period: "/mes",
    features: [
      "Hasta 5 negocios",
      "Todo de Pro",
      "Usuarios ilimitados",
      "Roles personalizados",
      "API access",
      "Integraciones",
      "Soporte dedicado",
    ],
    cta: "Contactar ventas",
    variant: "default" as const,
    popular: false,
  },
];

export const Pricing = () => {
  return (
    <section className="py-24 bg-muted/30" id="pricing">
      <div className="container px-4">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl font-display font-bold text-foreground mb-4">
            Planes simples, sin sorpresas
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Elige el plan que mejor se adapte a tu negocio. Cambia o cancela cuando quieras.
          </p>
        </motion.div>

        {/* Pricing cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              className={`relative p-8 rounded-2xl bg-card border ${
                plan.popular 
                  ? "border-primary shadow-lg shadow-primary/10 scale-105" 
                  : "border-border"
              } transition-all duration-300 hover:shadow-lg`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-gradient-primary text-primary-foreground text-sm font-semibold">
                  <Sparkles className="w-4 h-4" />
                  Más popular
                </div>
              )}
              
              <div className="mb-6">
                <h3 className="text-xl font-semibold text-foreground mb-1">
                  {plan.name}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {plan.description}
                </p>
              </div>
              
              <div className="mb-6">
                <span className="text-4xl font-display font-bold text-foreground">
                  €{plan.price}
                </span>
                <span className="text-muted-foreground ml-1">
                  {plan.period}
                </span>
              </div>
              
              <ul className="space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-success/10 flex items-center justify-center">
                      <Check className="w-3 h-3 text-success" />
                    </div>
                    <span className="text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
              
              <Button variant={plan.variant} size="lg" className="w-full">
                {plan.cta}
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
