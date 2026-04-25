// commandIconUrl(cmd) — maps a raw command string to a color PNG asset URL.
// Falls back to terminal.png for unknown commands.

import dockerUrl  from '../../assets/docker.png'
import gitUrl     from '../../assets/git.png'
import goUrl      from '../../assets/go.png'
import k8sUrl     from '../../assets/k8s.png'
import nodeUrl    from '../../assets/node.png'
import pythonUrl  from '../../assets/python.png'
import termUrl    from '../../assets/terminal.png'

const MAP = {
  // git / github
  git: gitUrl, gh: gitUrl, hub: gitUrl, lazygit: gitUrl,

  // containers / orchestration
  docker: dockerUrl, 'docker-compose': dockerUrl, dc: dockerUrl, podman: dockerUrl,

  // kubernetes
  kubectl: k8sUrl, k: k8sUrl, helm: k8sUrl, k9s: k8sUrl, minikube: k8sUrl, kind: k8sUrl,

  // node / js
  npm: nodeUrl, yarn: nodeUrl, pnpm: nodeUrl, node: nodeUrl,
  npx: nodeUrl, bun: nodeUrl, deno: nodeUrl, tsc: nodeUrl,

  // python
  python: pythonUrl, python3: pythonUrl, py: pythonUrl,
  pip: pythonUrl, pip3: pythonUrl, uv: pythonUrl,
  poetry: pythonUrl, pytest: pythonUrl, ruff: pythonUrl,

  // go
  go: goUrl, gofmt: goUrl, goimports: goUrl,
}

export function commandIconUrl(cmd) {
  if (!cmd) return termUrl
  const first = cmd.trim().split(/\s+/)[0]
  if (!first) return termUrl
  const base = first.split('/').pop().toLowerCase()
  return MAP[base] ?? termUrl
}
