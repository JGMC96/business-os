import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  FileText, 
  CreditCard, 
  AlertCircle,
  ArrowUpRight,
  DollarSign,
  Loader2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardMetrics } from "@/hooks/useDashboardMetrics";

const formatPrice = (amount: number): string => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(amount);
};

const formatChange = (value: number, isPercentage: boolean = true): string => {
  const prefix = value > 0 ? '+' : '';
  if (isPercentage) {
    return `${prefix}${value.toFixed(1)}%`;
  }
  return `${prefix}${value}`;
};

// Hardcoded recent activity for now - will be replaced with real data in future iteration
const recentActivity = [
  { type: "payment", title: "Pago recibido", description: "Ejemplo de actividad", amount: "+$450", time: "Recientemente" },
  { type: "invoice", title: "Factura creada", description: "Ejemplo de factura", amount: "$890", time: "Recientemente" },
];

export const DashboardOverview = () => {
  const navigate = useNavigate();
  const metrics = useDashboardMetrics();

  const stats = [
    {
      title: "Ingresos del mes",
      value: formatPrice(metrics.monthlyRevenue),
      change: formatChange(metrics.monthlyRevenueChange),
      trend: metrics.monthlyRevenueChange > 0 ? "up" : metrics.monthlyRevenueChange < 0 ? "down" : "neutral",
      icon: DollarSign,
      color: "text-success",
      bgColor: "bg-success/10",
    },
    {
      title: "Clientes activos",
      value: metrics.activeClients.toString(),
      change: formatChange(metrics.activeClientsChange, false),
      trend: metrics.activeClientsChange > 0 ? "up" : metrics.activeClientsChange < 0 ? "down" : "neutral",
      icon: Users,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Facturas pendientes",
      value: metrics.pendingInvoices.toString(),
      change: formatPrice(metrics.pendingAmount),
      trend: "neutral",
      icon: FileText,
      color: "text-warning",
      bgColor: "bg-warning/10",
    },
    {
      title: "Pagos recibidos",
      value: metrics.monthlyPaymentsCount.toString(),
      change: formatChange(metrics.monthlyPaymentsChange),
      trend: metrics.monthlyPaymentsChange > 0 ? "up" : metrics.monthlyPaymentsChange < 0 ? "down" : "neutral",
      icon: CreditCard,
      color: "text-accent",
      bgColor: "bg-accent/10",
    },
  ];

  const alerts = metrics.overdueInvoices > 0 
    ? [
        { 
          title: `${metrics.overdueInvoices} factura${metrics.overdueInvoices > 1 ? 's' : ''} vencida${metrics.overdueInvoices > 1 ? 's' : ''}`, 
          description: `Total: ${formatPrice(metrics.overdueAmount)} pendiente de cobro`, 
          severity: "high" 
        },
      ]
    : [];

  if (metrics.isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground">Resumen de tu negocio</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-12 w-12 rounded-xl mb-4" />
                <Skeleton className="h-8 w-24 mb-2" />
                <Skeleton className="h-4 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">Resumen de tu negocio</p>
        </div>
        <Button onClick={() => navigate('/dashboard/invoices/new')}>
          Nueva factura
          <ArrowUpRight className="w-4 h-4 ml-1" />
        </Button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
          >
            <Card className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                    <stat.icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                  <div className="flex items-center gap-1 text-sm">
                    {stat.trend === "up" ? (
                      <TrendingUp className="w-4 h-4 text-success" />
                    ) : stat.trend === "down" ? (
                      <TrendingDown className="w-4 h-4 text-destructive" />
                    ) : null}
                    <span className={stat.trend === "up" ? "text-success" : stat.trend === "down" ? "text-destructive" : "text-muted-foreground"}>
                      {stat.change}
                    </span>
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent activity */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-semibold">Actividad reciente</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/payments')}>Ver todo</Button>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No hay actividad reciente</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentActivity.map((activity, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.3 + index * 0.1 }}
                    className="flex items-center justify-between py-3 border-b border-border last:border-0"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        activity.type === "payment" ? "bg-success/10" :
                        activity.type === "invoice" ? "bg-primary/10" :
                        activity.type === "client" ? "bg-accent/10" :
                        "bg-warning/10"
                      }`}>
                        {activity.type === "payment" ? <CreditCard className="w-5 h-5 text-success" /> :
                         activity.type === "invoice" ? <FileText className="w-5 h-5 text-primary" /> :
                         activity.type === "client" ? <Users className="w-5 h-5 text-accent" /> :
                         <AlertCircle className="w-5 h-5 text-warning" />}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{activity.title}</p>
                        <p className="text-sm text-muted-foreground">{activity.description}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      {activity.amount && (
                        <p className={`font-medium ${activity.amount.startsWith("+") ? "text-success" : "text-foreground"}`}>
                          {activity.amount}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">{activity.time}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Alerts */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-semibold">Alertas</CardTitle>
            {alerts.length > 0 && (
              <span className="text-xs font-medium text-destructive bg-destructive/10 px-2 py-1 rounded-full">
                {alerts.length}
              </span>
            )}
          </CardHeader>
          <CardContent>
            {alerts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No hay alertas pendientes</p>
              </div>
            ) : (
              <div className="space-y-4">
                {alerts.map((alert, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.5 + index * 0.1 }}
                    className={`p-4 rounded-xl border ${
                      alert.severity === "high" 
                        ? "border-destructive/30 bg-destructive/5" 
                        : "border-warning/30 bg-warning/5"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <AlertCircle className={`w-5 h-5 mt-0.5 ${
                        alert.severity === "high" ? "text-destructive" : "text-warning"
                      }`} />
                      <div>
                        <p className="font-medium text-foreground">{alert.title}</p>
                        <p className="text-sm text-muted-foreground">{alert.description}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
            <Button 
              variant="outline" 
              className="w-full mt-4"
              onClick={() => navigate('/dashboard/invoices')}
            >
              Ver facturas
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
