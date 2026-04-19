// commandIcon(cmd) — maps a raw command string (e.g. "git status", "/usr/bin/kubectl get pods")
// to an icon component reference. Caller renders <Icon size={...} />. Pure, no side effects.
//
// Resolution: take first whitespace token → strip leading path → lowercase → lookup.
// Falls back to a generic terminal icon on miss.

import {
  GitBranchIcon,
  PencilSimpleIcon,
  TerminalWindowIcon,
  GlobeIcon,
  FolderIcon,
  FileTextIcon,
  MagnifyingGlassIcon,
  HammerIcon,
  SparkleIcon,
  DatabaseIcon,
  PackageIcon,
  TreeStructureIcon,
  WrenchIcon,
} from '@phosphor-icons/react'
import { SiDocker, SiKubernetes, SiNodedotjs, SiPython, SiGo, SiRust } from 'react-icons/si'
import { BsTerminalFill } from 'react-icons/bs'

const MAP = {
  // git / github
  git: GitBranchIcon,
  gh: GitBranchIcon,
  hub: GitBranchIcon,
  lazygit: GitBranchIcon,

  // editors
  vim: PencilSimpleIcon,
  nvim: PencilSimpleIcon,
  vi: PencilSimpleIcon,
  nano: PencilSimpleIcon,
  micro: PencilSimpleIcon,
  code: PencilSimpleIcon,
  subl: PencilSimpleIcon,
  hx: PencilSimpleIcon,
  emacs: PencilSimpleIcon,

  // containers / orchestration
  docker: SiDocker,
  'docker-compose': SiDocker,
  dc: SiDocker,
  podman: SiDocker,
  kubectl: SiKubernetes,
  k: SiKubernetes,
  helm: SiKubernetes,
  k9s: SiKubernetes,
  minikube: SiKubernetes,
  kind: SiKubernetes,

  // node / js
  npm: SiNodedotjs,
  yarn: SiNodedotjs,
  pnpm: SiNodedotjs,
  node: SiNodedotjs,
  npx: SiNodedotjs,
  bun: SiNodedotjs,
  deno: SiNodedotjs,
  tsc: SiNodedotjs,

  // python
  python: SiPython,
  python3: SiPython,
  py: SiPython,
  pip: SiPython,
  pip3: SiPython,
  uv: SiPython,
  poetry: SiPython,
  pytest: SiPython,
  ruff: SiPython,

  // go
  go: SiGo,
  gofmt: SiGo,
  goimports: SiGo,

  // rust
  cargo: SiRust,
  rustc: SiRust,
  rustup: SiRust,

  // network / http
  ssh: TerminalWindowIcon,
  scp: TerminalWindowIcon,
  mosh: TerminalWindowIcon,
  curl: GlobeIcon,
  wget: GlobeIcon,
  http: GlobeIcon,
  httpie: GlobeIcon,
  xh: GlobeIcon,

  // filesystem
  ls: FolderIcon,
  ll: FolderIcon,
  la: FolderIcon,
  tree: TreeStructureIcon,
  find: FolderIcon,
  fd: FolderIcon,
  cd: FolderIcon,
  pwd: FolderIcon,
  mkdir: FolderIcon,

  // read
  cat: FileTextIcon,
  bat: FileTextIcon,
  less: FileTextIcon,
  more: FileTextIcon,
  head: FileTextIcon,
  tail: FileTextIcon,

  // search
  grep: MagnifyingGlassIcon,
  rg: MagnifyingGlassIcon,
  ag: MagnifyingGlassIcon,
  ack: MagnifyingGlassIcon,

  // build
  make: HammerIcon,
  cmake: HammerIcon,
  ninja: HammerIcon,
  bazel: HammerIcon,
  gradle: HammerIcon,
  mvn: HammerIcon,

  // AI
  claude: SparkleIcon,
  aider: SparkleIcon,
  cursor: SparkleIcon,
  gemini: SparkleIcon,

  // data
  psql: DatabaseIcon,
  mysql: DatabaseIcon,
  sqlite3: DatabaseIcon,
  redis: DatabaseIcon,
  'redis-cli': DatabaseIcon,
  mongosh: DatabaseIcon,

  // pkg managers (os)
  brew: PackageIcon,
  apt: PackageIcon,
  'apt-get': PackageIcon,
  dnf: PackageIcon,
  yum: PackageIcon,
  pacman: PackageIcon,

  // misc tools
  ssh_config: WrenchIcon,
  systemctl: WrenchIcon,
  service: WrenchIcon,
}

export function commandIcon(cmd) {
  if (!cmd) return BsTerminalFill
  const first = cmd.trim().split(/\s+/)[0]
  if (!first) return BsTerminalFill
  const base = first.split('/').pop().toLowerCase()
  return MAP[base] || BsTerminalFill
}
