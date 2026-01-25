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
      {/* Disclaimer principal */}
      <div className="bg-amber-50 border-t border-b border-amber-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs text-amber-900 leading-relaxed">
                <strong>⚠️ Avertissement important :</strong> BienCouvert est un outil d'aide à la décision utilisant l'intelligence artificielle. 
                Les analyses, recommandations et réponses générées par l'IA sont fournies <strong>à titre purement informatif</strong> et 
                <strong> ne sont pas vérifiées par un professionnel agréé</strong>. Elles ne constituent en aucun cas des conseils en assurance 
                au sens légal. Les résultats peuvent contenir des erreurs ou inexactitudes. Pour toute décision importante concernant vos contrats 
                d'assurance, nous vous recommandons vivement de consulter un courtier, agent général ou assureur agréé.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation et informations légales */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {/* À propos */}
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-3">BienCouvert</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Votre assistant personnel pour centraliser et optimiser vos contrats d'assurance grâce à l'intelligence artificielle.
            </p>
          </div>

          {/* Liens légaux */}
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-3">Informations légales</h3>
            <ul className="space-y-2">
              <li>
                {onNavigateToTerms ? (
                  <button 
                    onClick={onNavigateToTerms}
                    className="text-xs text-slate-600 hover:text-primary-600 flex items-center gap-1 transition-colors"
                  >
                    Conditions d'utilisation
                  </button>
                ) : (
                  <a href="/conditions-utilisation" className="text-xs text-slate-600 hover:text-primary-600 flex items-center gap-1 transition-colors">
                    Conditions d'utilisation <ExternalLink size={12} />
                  </a>
                )}
              </li>
              <li>
                {onNavigateToPrivacy ? (
                  <button 
                    onClick={onNavigateToPrivacy}
                    className="text-xs text-slate-600 hover:text-primary-600 flex items-center gap-1 transition-colors"
                  >
                    Politique de confidentialité
                  </button>
                ) : (
                  <a href="/politique-confidentialite" className="text-xs text-slate-600 hover:text-primary-600 flex items-center gap-1 transition-colors">
                    Politique de confidentialité <ExternalLink size={12} />
                  </a>
                )}
              </li>
            </ul>
          </div>

          {/* Protection des données */}
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
              <Shield size={16} className="text-primary-600" />
              Protection des données
            </h3>
            <div className="space-y-2 text-xs text-slate-600">
              <p>✓ Conforme RGPD</p>
              <p>✓ Hébergement Azure Europe</p>
              <p>✓ Chiffrement SSL/TLS</p>
              <p>✓ Données sécurisées</p>
            </div>
          </div>
        </div>

        {/* Copyright et contact */}
        <div className="border-t border-slate-200 pt-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-3">
            <p className="text-xs text-slate-500">
              © {currentYear} BienCouvert (AssurClair). Tous droits réservés.
            </p>
            <a 
              href="mailto:contact@biencouvert.fr" 
              className="text-xs text-slate-500 hover:text-primary-600 transition-colors"
            >
              contact@biencouvert.fr
            </a>
          </div>
        </div>
      </div>

      {/* Disclaimer RGPD discret */}
      <div className="bg-slate-50 border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <p className="text-xs text-slate-500 text-center leading-relaxed">
            Vos données personnelles sont collectées et traitées conformément au Règlement Général sur la Protection des Données (RGPD). 
            Vous disposez d'un droit d'accès, de rectification, d'effacement et de portabilité de vos données. 
            Pour exercer ces droits : <a href="mailto:contact@biencouvert.fr" className="text-primary-600 underline">contact@biencouvert.fr</a>
          </p>
        </div>
      </div>
    </footer>
  );
}
