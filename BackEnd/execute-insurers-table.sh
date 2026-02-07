#!/bin/bash
# Script d'exécution du SQL sur la VM

echo "Exécution du SQL..."
PGPASSWORD="Remi1982" psql -h 52.143.159.51 -U remijolivalt -d assurclair -f /tmp/create-insurers-insurance-types-table.sql

echo "✅ Table insurers_insurance_types créée avec succès"
