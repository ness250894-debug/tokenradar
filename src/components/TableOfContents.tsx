"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { List, ChevronRight } from "lucide-react";

interface Section {
  id: string;
  label: string;
}

export function TableOfContents({ sections }: { sections: Section[] }) {
  const [activeId, setActiveId] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );

    sections.forEach((section) => {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [sections]);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const offset = 100;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth"
      });
    }
    setIsOpen(false);
  };

  return (
    <>
    <div className="toc-wrapper">
      {/* Desktop Wrapper - Sticky Sidebar */}
      <aside className="hidden xl:block fixed right-8 top-32 w-64 z-[100]">
        <div 
          className="card p-4 shadow-2xl"
          style={{ 
            background: "rgba(10, 11, 15, 0.4)", 
            backdropFilter: "blur(20px) saturate(180%)",
            border: "1px solid rgba(255, 255, 255, 0.05)"
          }}
        >
          <div 
            className="flex items-center gap-2 mb-4 text-xs font-bold uppercase tracking-widest"
            style={{ color: "var(--text-muted)" }}
          >
            <List size={14} />
            Quick Navigation
          </div>
          <nav className="flex flex-col gap-1">
            {sections.map((section) => {
              const isActive = activeId === section.id;
              return (
                <button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className="text-left px-3 py-2 rounded-md text-sm transition-all flex items-center gap-2 group"
                  style={{ 
                    color: isActive ? "var(--accent-primary)" : "var(--text-secondary)",
                    background: isActive ? "rgba(217, 119, 6, 0.1)" : "transparent",
                    fontWeight: isActive ? 700 : 400,
                    transform: isActive ? "translateX(4px)" : "none"
                  }}
                >
                  <ChevronRight 
                    size={12} 
                    className="transition-all"
                    style={{ 
                      opacity: isActive ? 1 : 0,
                      transform: isActive ? "translateX(0)" : "translateX(-4px)"
                    }}
                  />
                  <span className={isActive ? "" : "group-hover:text-white transition-colors"}>
                    {section.label}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Mobile Floating Button - Truly Hidden on XL */}
      <div className="block xl:hidden fixed bottom-24 right-6 z-[100]">
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="card mb-4 p-3 shadow-2xl w-56 border-accent"
              style={{ 
                background: "rgba(10, 11, 15, 0.95)", 
                backdropFilter: "blur(20px)",
                border: "1px solid var(--accent-primary)",
              }}
            >
              <div className="flex flex-col gap-1">
                {sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => scrollToSection(section.id)}
                    className="text-left px-3 py-2 rounded-md text-sm transition-colors"
                    style={{ 
                      color: activeId === section.id ? "var(--accent-primary)" : "var(--text-secondary)",
                      background: activeId === section.id ? "rgba(217, 119, 6, 0.1)" : "transparent",
                      fontWeight: activeId === section.id ? 700 : 400
                    }}
                  >
                    {section.label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-12 h-12 rounded-full text-white flex items-center justify-center transition-all active:scale-90 shadow-lg"
          style={{ 
            background: "var(--accent-primary)",
            boxShadow: "0 0 20px rgba(217, 119, 6, 0.4)"
          }}
        >
          {isOpen ? <ChevronRight size={20} className="rotate-90" /> : <List size={20} />}
        </button>
      </div>
    </div>
    </>
  );
}
