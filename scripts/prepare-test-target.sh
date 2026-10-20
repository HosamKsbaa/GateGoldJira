#!/usr/bin/env bash
# Review-only preparation. Provisioning is a separate, explicitly scoped action.
set -euo pipefail
source "$(dirname "$0")/tool-env.sh"
cd "$GATEGOLD_ROOT"
terraform_cli="${GATEGOLD_TERRAFORM:-$GATEGOLD_ROOT/.tools/terraform-1.14.7/terraform}"
test -x "$terraform_cli" || { echo 'Install pinned Terraform1.14.7 or supply GATEGOLD_TERRAFORM.' >&2; exit 1; }
"$terraform_cli" -chdir=infra/terraform fmt -check
"$terraform_cli" -chdir=infra/terraform validate
if [[ $# -eq 0 ]]; then
  "$terraform_cli" -chdir=infra/terraform test
  echo 'Credential-free candidate plans complete. Real target plan, accounts and approval remain pending.'
else
  test $# -eq 1 || { echo 'Usage: prepare-test-target.sh [ABSOLUTE_PUBLIC_TARGET_TFVARS]' >&2; exit 1; }
  [[ "$1" = /* ]] && test -f "$1" || { echo 'Supply an absolute target variable file.' >&2; exit 1; }
  mkdir -p .local/cloud-review
  chmod 700 .local/cloud-review
  # Target-specific state stays in the configured Terraform backend. Inspect the
  # human-readable plan locally; never publish state, tokens or provider logs.
  "$terraform_cli" -chdir=infra/terraform plan -input=false -var-file="$1" -out="$GATEGOLD_ROOT/.local/cloud-review/candidate.tfplan"
  echo 'Saved a real target-specific plan for review. No apply or deployment ran.'
fi
