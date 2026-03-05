import React from 'react';
import { Shield, AlertTriangle, ExternalLink } from 'lucide-react';

interface FooterProps {
  onNavigateToPrivacy?: () => void;
  onNavigateToTerms?: () => void;
}

export default function Footer({ onNavigateToPrivacy, onNavigateToTerms }: FooterProps) {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white border-t border-slate-200 mt-auto">
      {/* Disclaimer principal condensé */}
      <div className="bg-amber-50 border-t border-b border-amber-200">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <p className="text-xs text-amber-900 text-center">
            <strong>⚠️ Avertissement :</strong> Outil d'aide à la décision par IA. Informations non vérifiées par un professionnel. 
            Consultez un courtier agréé pour toute décision importante.
          </p>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-600">
          {/* Liens légaux */}
          <div className="flex gap-4">
            {onNavigateToTerms ? (
              <button 
                onClick={onNavigateToTerms}
                className="hover:text-primary-600 transition-colors"
              >
                CGU
              </button>
            ) : (
              <a href="/conditions-utilisation" className="hover:text-primary-600 transition-colors">CGU</a>
            )}
            {onNavigateToPrivacy ? (
              <button 
                onClick={onNavigateToPrivacy}
                className="hover:text-primary-600 transition-colors"
              >
                Confidentialité
              </button>
            ) : (
              <a href="/politique-confidentialite" className="hover:text-primary-600 transition-colors">Confidentialité</a>
            )}
          </div>

          {/* Copyright */}
          <div className="flex items-center gap-2 text-slate-500">
            <img src="/petit_logo.png" alt="BienCouvert" className="w-5 h-5" />
            <p>© {currentYear} BienCouvert</p>
          </div>

          {/* Contact */}
          <a 
            href="mailto:contact@biencouvert.fr" 
            className="text-slate-500 hover:text-primary-600 transition-colors"
          >
            contact@biencouvert.fr
          </a>
        </div>
      </div>
    </footer>
  );
}
