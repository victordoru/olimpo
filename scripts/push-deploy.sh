#!/bin/bash
# Se ejecuta EN TU MAC: sube los commits y despliega en el VPS de una vez.
#   ./scripts/push-deploy.sh
set -e
cd "$(dirname "$0")/.."
git push origin "$(git branch --show-current)"
ssh victor@100.93.76.49 'bash ~/olimpo/scripts/deploy.sh'
