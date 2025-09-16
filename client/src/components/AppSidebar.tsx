import React, { useContext } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { FileContext } from "@/App";
import { useFormat } from "@/components/ui/format-selector";
import { Upload, Crop, Download, ChevronRight, Check, Settings } from "lucide-react";

export function AppSidebar() {
  const { state } = useSidebar();
  const { files } = useContext(FileContext);
  const { selectedFormat } = useFormat();
  const location = useLocation();
  const currentPath = location.pathname;
  const collapsed = state === "collapsed";

  const getSteps = () => {
    if (selectedFormat === 'A4') {
      return [
        { title: "Upload PDF", url: "/", icon: Upload, description: "Select one PDF file" },
        { title: "Crop PDF", url: "/crop", icon: Crop, description: "Define crop area" },
        { title: "Download TIFF", url: "/convert", icon: Download, description: "Get A4 TIFF file" },
      ];
    } else {
      return [
        { title: "Upload PDFs", url: "/", icon: Upload, description: "Select two PDF files" },
        { title: "Crop PDFs", url: "/crop", icon: Crop, description: "Define crop areas" },
        { title: "Merge & Convert", url: "/convert", icon: Download, description: "Get A3 TIFF file" },
      ];
    }
  };

  const steps = getSteps();
  const requiredFiles = selectedFormat === 'A4' ? 1 : 2;

  const getStepStatus = (stepUrl: string) => {
    if (stepUrl === "/") {
      if (files.length === requiredFiles && files.every(f => f.pageNumber)) {
        return "completed";
      }
      return currentPath === "/" ? "active" : "inactive";
    } else if (stepUrl === "/crop") {
      const hasRequiredCrops = selectedFormat === 'A4' 
        ? sessionStorage.getItem("crop1")
        : sessionStorage.getItem("crop1") && sessionStorage.getItem("crop2");
      
      if (hasRequiredCrops) return "completed";
      return currentPath === "/crop" && files.length === requiredFiles ? "active" : "inactive";
    } else if (stepUrl === "/convert") {
      const hasRequiredCrops = selectedFormat === 'A4' 
        ? sessionStorage.getItem("crop1")
        : sessionStorage.getItem("crop1") && sessionStorage.getItem("crop2");
      
      return currentPath === "/convert" && hasRequiredCrops ? "active" : "inactive";
    }
    return "inactive";
  };

  const canNavigate = (stepUrl: string) => {
    if (stepUrl === "/") return true;
    if (stepUrl === "/crop") return files.length === requiredFiles;
    if (stepUrl === "/convert") {
      return selectedFormat === 'A4' 
        ? sessionStorage.getItem("crop1")
        : sessionStorage.getItem("crop1") && sessionStorage.getItem("crop2");
    }
    return false;
  };

  const getNavClassName = (stepUrl: string) => {
    const status = getStepStatus(stepUrl);
    const baseClasses = "w-full justify-start gap-3 h-auto p-4 transition-all duration-300";

    if (status === "active") {
      return `${baseClasses} bg-primary text-primary-foreground shadow-md`;
    }
    if (status === "completed") {
      return `${baseClasses} bg-accent/10 text-accent hover:bg-accent/20`;
    }
    
    const disabled = !canNavigate(stepUrl);
    return `${baseClasses} hover:bg-muted/50 text-muted-foreground ${disabled ? "opacity-50 pointer-events-none" : ""}`;
  };

  return (
    <Sidebar className={`${collapsed ? "w-16" : "w-80"} glass-card border-r`}>
      <div className="p-6 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center">
            <Download className="h-4 w-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div>
              <h1 className="font-semibold text-lg">PixPlot</h1>
              <p className="text-sm text-muted-foreground">PDF to TIFF Converter</p>
            </div>
          )}
        </div>
      </div>

      <SidebarContent className="p-4">
        {!collapsed && (
          <div className="mb-6 p-3 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Settings className="h-4 w-4 text-accent" />
              <span className="text-sm font-medium">Current Format</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {selectedFormat} • {requiredFiles} PDF{requiredFiles > 1 ? 's' : ''} Required
            </div>
          </div>
        )}

        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-medium text-muted-foreground mb-4">
            Conversion Steps
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-2">
              {steps.map((step) => (
                <SidebarMenuItem key={step.title}>
                  <SidebarMenuButton asChild className="p-0">
                    <NavLink to={step.url} className={getNavClassName(step.url)}>
                      <div className="flex items-center gap-3 w-full">
                        <div className={`step-indicator ${getStepStatus(step.url)}`}>
                          {getStepStatus(step.url) === "completed" ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <step.icon className="h-4 w-4" />
                          )}
                        </div>
                        {!collapsed && (
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{step.title}</span>
                              <ChevronRight className="h-4 w-4 opacity-50" />
                            </div>
                            <p className="text-xs opacity-70 mt-1">{step.description}</p>
                          </div>
                        )}
                      </div>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        
        {!collapsed && (
          <div className="mt-8 p-4 glass rounded-xl">
            <h3 className="font-medium text-sm mb-2">Professional Features</h3>
            <ul className="text-xs space-y-1 text-muted-foreground">
              <li>• {selectedFormat === 'A4' ? 'Portrait' : '4:3 Aspect Ratio'} Cropping</li>
              <li>• 300+ DPI Output Quality</li>
              <li>• AutoCAD Compatible</li>
              <li>• Monochrome TIFF Export</li>
            </ul>
          </div>
        )}
        
        <div className="mt-8 p-4 flex justify-center">
          <div className="flex flex-col items-center gap-2">
            <img
              src="https://www.ausnetservices.com.au/-/media/project/ausnet/corporate-website/components/header/ausnet-logo.svg?iar=0&rev=cf580f366ffc4e2a8d736f1a3525e456&hash=0BD369FBA0DACEA8198262AD212B284B"
              alt="AusNet Services Logo"
              className={collapsed ? "w-10 h-auto" : "w-32 h-auto"}
            />
            {!collapsed && (
              <p className="text-xs text-muted-foreground">Powered by AusNet Services</p>
            )}
          </div>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}

export default AppSidebar;