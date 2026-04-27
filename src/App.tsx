import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { BusinessProvider } from "@/contexts/BusinessContext";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Onboarding from "./pages/Onboarding";
import SelectBusiness from "./pages/SelectBusiness";
import NotFound from "./pages/NotFound";
import { RequireAuth } from "./components/auth/RequireAuth";
import { RequireBusiness } from "./components/auth/RequireBusiness";
import { AuthRedirector } from "./components/auth/AuthRedirector";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <BusinessProvider>
          <AuthRedirector />
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            
            {/* Auth required routes */}
            <Route path="/onboarding" element={
              <RequireAuth>
                <Onboarding />
              </RequireAuth>
            } />
            <Route path="/select-business" element={
              <RequireAuth>
                <SelectBusiness />
              </RequireAuth>
            } />
            
            {/* Dashboard - requires auth + business */}
            <Route path="/dashboard/*" element={
              <RequireAuth>
                <RequireBusiness>
                  <Dashboard />
                </RequireBusiness>
              </RequireAuth>
            } />
            
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BusinessProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
