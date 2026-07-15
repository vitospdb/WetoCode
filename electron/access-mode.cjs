const AUTO_PERMISSION = {
  external_directory: 'ask',
  doom_loop: 'ask',
  read: { '*': 'allow', '*.env': 'ask', '*.env.*': 'ask', '*.env.example': 'allow' },
  bash: {
    '*': 'allow',
    'rm *': 'ask',
    'sudo *': 'ask',
    'git push *': 'ask',
    'git reset --hard*': 'ask',
    'git clean *': 'ask',
    'docker system prune*': 'ask',
    'kubectl delete *': 'ask',
    'terraform destroy*': 'ask',
  },
}

const CONFIRM_PERMISSION = {
  ...structuredClone(AUTO_PERMISSION),
  edit: 'ask',
  webfetch: 'ask',
  bash: { '*': 'ask' },
}

const PLAN_PERMISSION = {
  ...structuredClone(AUTO_PERMISSION),
  edit: 'deny',
  webfetch: 'ask',
  bash: { '*': 'deny' },
}

function normalizeAccessMode(value) {
  if (value === 'standard') return 'auto'
  return ['confirm', 'auto', 'plan', 'full'].includes(value) ? value : 'auto'
}

function permissionForAccessMode(value) {
  const normalized = normalizeAccessMode(value)
  if (normalized === 'full') return { '*': 'allow' }
  if (normalized === 'confirm') return structuredClone(CONFIRM_PERMISSION)
  if (normalized === 'plan') return structuredClone(PLAN_PERMISSION)
  return structuredClone(AUTO_PERMISSION)
}

module.exports = { normalizeAccessMode, permissionForAccessMode }
