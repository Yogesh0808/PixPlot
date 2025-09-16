import React, { createContext, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import Upload from "./pages/Upload";
import Crop from "./pages/Crop";
import Convert from "./pages/Convert";
import NotFound from "./pages/NotFound";

export const FileContext = createContext<{
  files: (File & { serverId?: string; serverPath?: string; pageNumber?: number; totalPages?: number; preview?: string })[];
  setFiles: React.Dispatch<React.SetStateAction<(File & { serverId?: string; serverPath?: string; pageNumber?: number; totalPages?: number; preview?: string })[]>>;
}>({
  files: [],
  setFiles: () => {},
});

const queryClient = new QueryClient();

const App = () => {
  const [files, setFiles] = useState<(File & { serverId?: string; serverPath?: string; pageNumber?: number; totalPages?: number; preview?: string })[]>([]);

  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <SidebarProvider>
          <FileContext.Provider value={{ files, setFiles }}>
            <div className="min-h-screen flex w-full">
              <AppSidebar />

              <main className="flex-1 flex flex-col">
                {/* Header */}
                <header
                  className="h-14 border-b border-border/50 glass
                             flex items-center px-6 shadow-soft backdrop-blur-md"
                >
                  <SidebarTrigger />
                  <div className="ml-8">
                    <h2 className="font-semibold text-lg">
                      PDF to TIFF Converter
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Professional document processing
                    </p>
                  </div>
                </header>

                {/* Page Content with smooth fade */}
                <div className="min-h-screen p-8 animate-fade-in-up">
                  <Routes>
                    <Route path="/" element={<Upload />} />
                    <Route path="/crop" element={<Crop />} />
                    <Route path="/convert" element={<Convert />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </div>
              </main>
            </div>
          </FileContext.Provider>
        </SidebarProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

};

export default App;