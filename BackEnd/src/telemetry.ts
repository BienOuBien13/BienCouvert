/**
 * Initialisation OpenTelemetry — métriques uniquement.
 * Activé via variable d'environnement OTEL_ENABLED=true
 * Exporte vers le OTel Collector via OTLP/HTTP (port 4318)
 */
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const METER_NAME = 'assurclair-backend';
let meterProvider: MeterProvider | null = null;

/**
 * Initialise le MeterProvider OTel.
 * Doit être appelé au démarrage du serveur (avant toute utilisation des métriques).
 */
export function initTelemetry(): void {
  const enabled = process.env.OTEL_ENABLED === 'true';
  if (!enabled) {
    console.log('📊 Télémétrie OTel désactivée (OTEL_ENABLED≠true) — set OTEL_ENABLED=true pour activer');
    return;
  }

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://otel-collector:4318';

  try {
    const exporter = new OTLPMetricExporter({
      url: `${endpoint}/v1/metrics`,
      headers: {}, // pas d'auth vers le OTel Collector interne
    });

    meterProvider = new MeterProvider({
      resource: new Resource({
        [SEMRESATTRS_SERVICE_NAME]: 'assurclair-backend',
        [SEMRESATTRS_SERVICE_VERSION]: process.env.npm_package_version || '1.0.0',
        'deployment.environment': process.env.NODE_ENV || 'production',
      }),
      readers: [
        new PeriodicExportingMetricReader({
          exporter,
          exportIntervalMillis: 30_000, // export toutes les 30 secondes
        }),
      ],
    });

    console.log(`📊 Télémétrie OTel initialisée → ${endpoint}`);
  } catch (err) {
    console.error('⚠️ OTel init failed (non-bloquant):', err);
  }
}

/**
 * Retourne le Meter OTel actif.
 * Si la télémétrie est désactivée, retourne un Meter no-op (à partir de l'API OTel).
 */
export function getMeter() {
  if (meterProvider) {
    return meterProvider.getMeter(METER_NAME, '1.0.0');
  }
  // No-op meter — aucun effet si OTel n'est pas configuré
  const { metrics } = require('@opentelemetry/api');
  return metrics.getMeter(METER_NAME);
}
