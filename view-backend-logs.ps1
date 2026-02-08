# Voir les logs du backend sur la VM pour diagnostiquer le RAG

Write-Host "=== Logs backend (dernières lignes) ===" -ForegroundColor Cyan
ssh VMRemi19821982@52.143.159.51 "cd AssurClair && docker-compose logs backend --tail=100 | grep -E '(RAG|CG|Embedding|sendMessageToAssistant)'"
