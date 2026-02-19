#!/bin/bash
# =============================================================================
# fix-db-recovery.sh — Répare PostgreSQL en recovery mode + applique migration 009
# Usage : bash fix-db-recovery.sh
# =============================================================================
set -e

PGUSER="remijolivalt"
PGDB="assurclair"
export PGPASSWORD="Remi1982"

echo "======================================================================"
echo "  ÉTAPE 1 — Diagnostic PostgreSQL"
echo "======================================================================"

PG_STATUS=$(sudo systemctl is-active postgresql 2>/dev/null || echo "unknown")
echo "Service PostgreSQL : $PG_STATUS"

if [ "$PG_STATUS" != "active" ]; then
  echo "⚠️  PostgreSQL n'est pas actif — redémarrage..."
  sudo systemctl restart postgresql
  sleep 5
  PG_STATUS=$(sudo systemctl is-active postgresql 2>/dev/null || echo "unknown")
  echo "Service PostgreSQL après restart : $PG_STATUS"
fi

echo ""
echo "======================================================================"
echo "  ÉTAPE 2 — Vérifier si PostgreSQL est en recovery mode"
echo "======================================================================"

IN_RECOVERY=$(psql -U "$PGUSER" -d postgres -tAc "SELECT pg_is_in_recovery();" 2>/dev/null || echo "error")
echo "pg_is_in_recovery() = $IN_RECOVERY"

if [ "$IN_RECOVERY" = "t" ]; then
  echo "⚠️  PostgreSQL est en mode standby/recovery !"
  echo ""
  echo "Vérification du fichier standby.signal..."
  PG_DATA=$(sudo -u postgres psql -tAc "SHOW data_directory;" 2>/dev/null || echo "/var/lib/postgresql/14/main")
  echo "data_directory = $PG_DATA"

  if sudo test -f "$PG_DATA/standby.signal" 2>/dev/null; then
    echo "⚠️  Fichier standby.signal trouvé — le serveur est configuré comme réplica."
    echo "   Pour le promouvoir en primaire :"
    echo "   sudo -u postgres pg_ctl promote -D $PG_DATA"
    sudo -u postgres pg_ctl promote -D "$PG_DATA" || true
    sleep 3
  else
    echo "   Pas de standby.signal — crash recovery en cours, attendons..."
    for i in {1..10}; do
      sleep 5
      REC=$(psql -U "$PGUSER" -d postgres -tAc "SELECT pg_is_in_recovery();" 2>/dev/null || echo "t")
      echo "   Tentative $i/10 : pg_is_in_recovery() = $REC"
      if [ "$REC" = "f" ]; then
        echo "✅ PostgreSQL en mode normal !"
        break
      fi
    done
  fi
elif [ "$IN_RECOVERY" = "error" ]; then
  echo "❌ Impossible de se connecter à PostgreSQL. Vérifiez les logs :"
  sudo tail -30 /var/log/postgresql/postgresql-*.log 2>/dev/null || sudo journalctl -u postgresql --no-pager -n 30 || true
  exit 1
else
  echo "✅ PostgreSQL est en mode primaire (normal)."
fi

echo ""
echo "======================================================================"
echo "  ÉTAPE 3 — Vérifier l'espace disque"
echo "======================================================================"
df -h / /var/lib/postgresql 2>/dev/null || df -h
FREE_KB=$(df / | awk 'NR==2 {print $4}')
if [ "$FREE_KB" -lt 512000 ]; then
  echo "⚠️  Moins de 500 MB libres sur / — risque de crash PostgreSQL !"
  echo "   Nettoyage des logs Docker..."
  docker system prune -f 2>/dev/null || true
fi

echo ""
echo "======================================================================"
echo "  ÉTAPE 4 — Appliquer la migration 009 (colonnes manquantes)"
echo "======================================================================"

echo "Vérification des colonnes existantes..."
COL_CHUNK=$(psql -U "$PGUSER" -d "$PGDB" -tAc \
  "SELECT column_name FROM information_schema.columns WHERE table_name='central_cg_pages' AND column_name='chunk_type';" 2>/dev/null || echo "")
COL_VSTATUS=$(psql -U "$PGUSER" -d "$PGDB" -tAc \
  "SELECT column_name FROM information_schema.columns WHERE table_name='central_cg' AND column_name='vectorization_status';" 2>/dev/null || echo "")

echo "  chunk_type in central_cg_pages : '${COL_CHUNK:-ABSENT}'"
echo "  vectorization_status in central_cg : '${COL_VSTATUS:-ABSENT}'"

if [ -z "$COL_CHUNK" ] || [ -z "$COL_VSTATUS" ]; then
  echo ""
  echo "Colonnes manquantes détectées — Application de la migration 009..."
  psql -U "$PGUSER" -d "$PGDB" <<'SQL'
BEGIN;

-- central_cg_pages : colonnes de classification sémantique
ALTER TABLE central_cg_pages
  ADD COLUMN IF NOT EXISTS chunk_type TEXT
    CHECK (chunk_type IN ('definition','garantie','exclusion','restriction','tableau','general','inconnu'))
    DEFAULT 'inconnu';

ALTER TABLE central_cg_pages
  ADD COLUMN IF NOT EXISTS guarantee_codes TEXT[] DEFAULT '{}';

ALTER TABLE central_cg_pages
  ADD COLUMN IF NOT EXISTS article_ref TEXT;

ALTER TABLE central_cg_pages
  ADD COLUMN IF NOT EXISTS classification_confidence FLOAT DEFAULT 0;

-- central_cg : suivi de vectorisation
ALTER TABLE central_cg
  ADD COLUMN IF NOT EXISTS vectorization_status TEXT
    CHECK (vectorization_status IN ('pending','processing','done','failed','partial'))
    DEFAULT 'pending';

ALTER TABLE central_cg
  ADD COLUMN IF NOT EXISTS pages_total INT DEFAULT 0;

ALTER TABLE central_cg
  ADD COLUMN IF NOT EXISTS pages_processed INT DEFAULT 0;

ALTER TABLE central_cg
  ADD COLUMN IF NOT EXISTS tables_extracted INT DEFAULT 0;

ALTER TABLE central_cg
  ADD COLUMN IF NOT EXISTS vectorized_at TIMESTAMP;

ALTER TABLE central_cg
  ADD COLUMN IF NOT EXISTS vectorization_error TEXT;

-- Mettre à jour le statut des CG qui ont déjà des pages vectorisées
UPDATE central_cg cg
SET
  vectorization_status = 'done',
  pages_processed = (SELECT COUNT(*) FROM central_cg_pages p WHERE p.central_cg_id = cg.id),
  tables_extracted = (SELECT COUNT(*) FROM central_cg_pages p WHERE p.central_cg_id = cg.id AND p.has_table = TRUE),
  vectorized_at = (SELECT MAX(updated_at) FROM central_cg_pages p WHERE p.central_cg_id = cg.id)
WHERE EXISTS (SELECT 1 FROM central_cg_pages p WHERE p.central_cg_id = cg.id);

-- Index
CREATE INDEX IF NOT EXISTS idx_cg_pages_chunk_type
  ON central_cg_pages(central_cg_id, chunk_type);
CREATE INDEX IF NOT EXISTS idx_central_cg_vectorization_status
  ON central_cg(vectorization_status);

-- Vue RAG enrichie
CREATE OR REPLACE VIEW v_rag_chunks AS
SELECT
  p.id, p.central_cg_id, p.page_number, p.content_text, p.embedding,
  p.chunk_type, p.guarantee_codes, p.article_ref, p.has_table, p.classification_confidence,
  cg.insurer_code, cg.insurance_type_code, cg.version
FROM central_cg_pages p
JOIN central_cg cg ON p.central_cg_id = cg.id
WHERE cg.status = 'active';

COMMIT;
SQL
  echo "✅ Migration 009 appliquée avec succès."
else
  echo "✅ Colonnes déjà présentes — migration non nécessaire."
fi

echo ""
echo "======================================================================"
echo "  ÉTAPE 5 — Vérification finale du schéma"
echo "======================================================================"
psql -U "$PGUSER" -d "$PGDB" -c "
SELECT table_name, column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name IN ('central_cg','central_cg_pages')
  AND column_name IN ('vectorization_status','chunk_type','pages_total','pages_processed','guarantee_codes','article_ref')
ORDER BY table_name, column_name;
"

echo ""
echo "======================================================================"
echo "  ÉTAPE 6 — Statistiques DB"
echo "======================================================================"
psql -U "$PGUSER" -d "$PGDB" -c "
SELECT
  (SELECT COUNT(*) FROM central_cg) AS nb_cg,
  (SELECT COUNT(*) FROM central_cg_pages) AS nb_pages,
  (SELECT COUNT(*) FROM central_cg WHERE vectorization_status = 'done') AS cg_done,
  (SELECT COUNT(*) FROM central_cg WHERE vectorization_status = 'pending' OR vectorization_status IS NULL) AS cg_pending;
"

echo ""
echo "======================================================================"
echo "✅ Diagnostic terminé."
echo "   Prochaine étape : reconstruire le backend Docker si des colonnes étaient manquantes."
echo "   cd ~/AssurClair && docker-compose build backend && docker-compose up -d backend"
echo "======================================================================"
