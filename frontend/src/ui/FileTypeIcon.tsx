import React from 'react';
import {
  Folder,
  FolderGit2,
  FolderCode,
  FolderCog,
  File,
  FileText,
  FileSpreadsheet,
  FileJson,
  FileCode2,
  FileArchive,
  FileAudio,
  FileVideo,
  FileImage,
  FileTerminal,
  FileKey,
  FileType,
  FileCheck2,
  Database,
  Table2,
  Presentation,
  AppWindow,
  Cpu,
  Disc,
  BookOpen,
  Settings,
  Shield,
  CornerDownRight,
  Palette,
  ScrollText,
} from 'lucide-react';

export interface FileTypeVisual {
  ext: string;
  badge: string;
  color: string;
  bgTint: string;
  typeLabel: string;
  category:
    | 'folder'
    | 'symlink'
    | 'pdf'
    | 'word'
    | 'spreadsheet'
    | 'csv'
    | 'presentation'
    | 'json'
    | 'markdown'
    | 'executable'
    | 'binary'
    | 'video'
    | 'audio'
    | 'image'
    | 'vector'
    | 'database'
    | 'sql'
    | 'archive'
    | 'disk'
    | 'code'
    | 'script'
    | 'config'
    | 'security'
    | 'font'
    | 'log'
    | 'text'
    | 'generic';
}

const EXTENSION_VISUAL_MAP: Record<string, Omit<FileTypeVisual, 'ext'>> = {
  // Documentos PDF
  pdf: {
    badge: 'PDF',
    color: '#ef4444',
    bgTint: 'rgba(239, 68, 68, 0.14)',
    typeLabel: 'Documento PDF',
    category: 'pdf',
  },

  // Microsoft Word & Texto Rico
  doc: {
    badge: 'DOC',
    color: '#2563eb',
    bgTint: 'rgba(37, 99, 235, 0.14)',
    typeLabel: 'Documento Word (.doc)',
    category: 'word',
  },
  docx: {
    badge: 'DOCX',
    color: '#2563eb',
    bgTint: 'rgba(37, 99, 235, 0.14)',
    typeLabel: 'Documento Word (.docx)',
    category: 'word',
  },
  odt: {
    badge: 'ODT',
    color: '#2563eb',
    bgTint: 'rgba(37, 99, 235, 0.14)',
    typeLabel: 'Documento OpenDocument',
    category: 'word',
  },
  rtf: {
    badge: 'RTF',
    color: '#3b82f6',
    bgTint: 'rgba(59, 130, 246, 0.14)',
    typeLabel: 'Documento Rich Text',
    category: 'word',
  },

  // Planilhas Excel / Calc
  xls: {
    badge: 'XLS',
    color: '#16a34a',
    bgTint: 'rgba(22, 163, 74, 0.14)',
    typeLabel: 'Planilha Excel (.xls)',
    category: 'spreadsheet',
  },
  xlsx: {
    badge: 'XLSX',
    color: '#16a34a',
    bgTint: 'rgba(22, 163, 74, 0.14)',
    typeLabel: 'Planilha Excel (.xlsx)',
    category: 'spreadsheet',
  },
  xlsm: {
    badge: 'XLSM',
    color: '#16a34a',
    bgTint: 'rgba(22, 163, 74, 0.14)',
    typeLabel: 'Planilha Excel com Macros',
    category: 'spreadsheet',
  },
  ods: {
    badge: 'ODS',
    color: '#16a34a',
    bgTint: 'rgba(22, 163, 74, 0.14)',
    typeLabel: 'Planilha OpenDocument',
    category: 'spreadsheet',
  },

  // Tabelas de Dados CSV / TSV / Parquet
  csv: {
    badge: 'CSV',
    color: '#10b981',
    bgTint: 'rgba(16, 185, 129, 0.14)',
    typeLabel: 'Tabela de Dados CSV',
    category: 'csv',
  },
  tsv: {
    badge: 'TSV',
    color: '#10b981',
    bgTint: 'rgba(16, 185, 129, 0.14)',
    typeLabel: 'Tabela de Dados TSV',
    category: 'csv',
  },
  parquet: {
    badge: 'PRQ',
    color: '#0d9488',
    bgTint: 'rgba(13, 148, 136, 0.14)',
    typeLabel: 'Dados Colunares Parquet',
    category: 'csv',
  },

  // Apresentações PowerPoint
  ppt: {
    badge: 'PPT',
    color: '#ea580c',
    bgTint: 'rgba(234, 88, 12, 0.14)',
    typeLabel: 'Apresentação PowerPoint',
    category: 'presentation',
  },
  pptx: {
    badge: 'PPTX',
    color: '#ea580c',
    bgTint: 'rgba(234, 88, 12, 0.14)',
    typeLabel: 'Apresentação PowerPoint',
    category: 'presentation',
  },
  odp: {
    badge: 'ODP',
    color: '#ea580c',
    bgTint: 'rgba(234, 88, 12, 0.14)',
    typeLabel: 'Apresentação OpenDocument (LibreOffice Impress)',
    category: 'presentation',
  },
  otp: {
    badge: 'OTP',
    color: '#ea580c',
    bgTint: 'rgba(234, 88, 12, 0.14)',
    typeLabel: 'Modelo de Apresentação OpenDocument',
    category: 'presentation',
  },
  fodp: {
    badge: 'FODP',
    color: '#ea580c',
    bgTint: 'rgba(234, 88, 12, 0.14)',
    typeLabel: 'Apresentação OpenDocument Flat XML',
    category: 'presentation',
  },
  ppsx: {
    badge: 'PPSX',
    color: '#ea580c',
    bgTint: 'rgba(234, 88, 12, 0.14)',
    typeLabel: 'Apresentação de Slides PowerPoint',
    category: 'presentation',
  },
  potx: {
    badge: 'POTX',
    color: '#ea580c',
    bgTint: 'rgba(234, 88, 12, 0.14)',
    typeLabel: 'Modelo PowerPoint (.potx)',
    category: 'presentation',
  },
  pps: {
    badge: 'PPS',
    color: '#ea580c',
    bgTint: 'rgba(234, 88, 12, 0.14)',
    typeLabel: 'Apresentação de Slides PowerPoint 97-2003',
    category: 'presentation',
  },
  pot: {
    badge: 'POT',
    color: '#ea580c',
    bgTint: 'rgba(234, 88, 12, 0.14)',
    typeLabel: 'Modelo PowerPoint 97-2003',
    category: 'presentation',
  },

  // JSON & Estruturas de Dados
  json: {
    badge: 'JSON',
    color: '#f59e0b',
    bgTint: 'rgba(245, 158, 11, 0.14)',
    typeLabel: 'Estrutura de Dados JSON',
    category: 'json',
  },
  jsonl: {
    badge: 'JSONL',
    color: '#f59e0b',
    bgTint: 'rgba(245, 158, 11, 0.14)',
    typeLabel: 'JSON Lines (.jsonl)',
    category: 'json',
  },
  json5: {
    badge: 'JSON5',
    color: '#f59e0b',
    bgTint: 'rgba(245, 158, 11, 0.14)',
    typeLabel: 'Arquivo JSON5',
    category: 'json',
  },

  // Markdown & Documentação
  md: {
    badge: 'MD',
    color: '#38bdf8',
    bgTint: 'rgba(56, 189, 248, 0.14)',
    typeLabel: 'Documento Markdown',
    category: 'markdown',
  },
  mdx: {
    badge: 'MDX',
    color: '#38bdf8',
    bgTint: 'rgba(56, 189, 248, 0.14)',
    typeLabel: 'Documento MDX',
    category: 'markdown',
  },
  markdown: {
    badge: 'MD',
    color: '#38bdf8',
    bgTint: 'rgba(56, 189, 248, 0.14)',
    typeLabel: 'Documento Markdown',
    category: 'markdown',
  },

  // Executáveis, Instaladores & Binários
  exe: {
    badge: 'EXE',
    color: '#8b5cf6',
    bgTint: 'rgba(139, 92, 246, 0.15)',
    typeLabel: 'Aplicativo Executável (.exe)',
    category: 'executable',
  },
  msi: {
    badge: 'MSI',
    color: '#8b5cf6',
    bgTint: 'rgba(139, 92, 246, 0.15)',
    typeLabel: 'Instalador Windows (.msi)',
    category: 'executable',
  },
  msix: {
    badge: 'MSIX',
    color: '#8b5cf6',
    bgTint: 'rgba(139, 92, 246, 0.15)',
    typeLabel: 'Pacote Windows (.msix)',
    category: 'executable',
  },
  apk: {
    badge: 'APK',
    color: '#22c55e',
    bgTint: 'rgba(34, 197, 94, 0.14)',
    typeLabel: 'Pacote Android (.apk)',
    category: 'executable',
  },
  dmg: {
    badge: 'DMG',
    color: '#64748b',
    bgTint: 'rgba(100, 116, 139, 0.14)',
    typeLabel: 'Imagem de Disco macOS',
    category: 'executable',
  },
  deb: {
    badge: 'DEB',
    color: '#e11d48',
    bgTint: 'rgba(225, 29, 72, 0.14)',
    typeLabel: 'Pacote Debian (.deb)',
    category: 'executable',
  },
  rpm: {
    badge: 'RPM',
    color: '#e11d48',
    bgTint: 'rgba(225, 29, 72, 0.14)',
    typeLabel: 'Pacote RPM (.rpm)',
    category: 'executable',
  },
  dll: {
    badge: 'DLL',
    color: '#64748b',
    bgTint: 'rgba(100, 116, 139, 0.14)',
    typeLabel: 'Biblioteca Dinâmica (.dll)',
    category: 'binary',
  },
  so: {
    badge: 'SO',
    color: '#64748b',
    bgTint: 'rgba(100, 116, 139, 0.14)',
    typeLabel: 'Biblioteca Compartilhada (.so)',
    category: 'binary',
  },
  sys: {
    badge: 'SYS',
    color: '#64748b',
    bgTint: 'rgba(100, 116, 139, 0.14)',
    typeLabel: 'Arquivo de Sistema (.sys)',
    category: 'binary',
  },
  syso: {
    badge: 'SYSO',
    color: '#64748b',
    bgTint: 'rgba(100, 116, 139, 0.14)',
    typeLabel: 'Recurso de Sistema Go (.syso)',
    category: 'binary',
  },
  wasm: {
    badge: 'WASM',
    color: '#654ff0',
    bgTint: 'rgba(101, 79, 240, 0.14)',
    typeLabel: 'Binário WebAssembly',
    category: 'binary',
  },

  // Vídeos
  mp4: {
    badge: 'MP4',
    color: '#a855f7',
    bgTint: 'rgba(168, 85, 247, 0.15)',
    typeLabel: 'Vídeo MP4',
    category: 'video',
  },
  mkv: {
    badge: 'MKV',
    color: '#a855f7',
    bgTint: 'rgba(168, 85, 247, 0.15)',
    typeLabel: 'Vídeo Matroska (.mkv)',
    category: 'video',
  },
  mov: {
    badge: 'MOV',
    color: '#a855f7',
    bgTint: 'rgba(168, 85, 247, 0.15)',
    typeLabel: 'Vídeo QuickTime (.mov)',
    category: 'video',
  },
  avi: {
    badge: 'AVI',
    color: '#a855f7',
    bgTint: 'rgba(168, 85, 247, 0.15)',
    typeLabel: 'Vídeo AVI',
    category: 'video',
  },
  webm: {
    badge: 'WEBM',
    color: '#a855f7',
    bgTint: 'rgba(168, 85, 247, 0.15)',
    typeLabel: 'Vídeo WebM',
    category: 'video',
  },
  wmv: {
    badge: 'WMV',
    color: '#a855f7',
    bgTint: 'rgba(168, 85, 247, 0.15)',
    typeLabel: 'Vídeo Windows Media',
    category: 'video',
  },
  flv: {
    badge: 'FLV',
    color: '#a855f7',
    bgTint: 'rgba(168, 85, 247, 0.15)',
    typeLabel: 'Vídeo Flash (.flv)',
    category: 'video',
  },
  m4v: {
    badge: 'M4V',
    color: '#a855f7',
    bgTint: 'rgba(168, 85, 247, 0.15)',
    typeLabel: 'Vídeo M4V',
    category: 'video',
  },

  // Áudio
  mp3: {
    badge: 'MP3',
    color: '#ec4899',
    bgTint: 'rgba(236, 72, 153, 0.15)',
    typeLabel: 'Áudio MP3',
    category: 'audio',
  },
  wav: {
    badge: 'WAV',
    color: '#ec4899',
    bgTint: 'rgba(236, 72, 153, 0.15)',
    typeLabel: 'Áudio WAV sem perdas',
    category: 'audio',
  },
  flac: {
    badge: 'FLAC',
    color: '#ec4899',
    bgTint: 'rgba(236, 72, 153, 0.15)',
    typeLabel: 'Áudio FLAC de alta fidelidade',
    category: 'audio',
  },
  ogg: {
    badge: 'OGG',
    color: '#ec4899',
    bgTint: 'rgba(236, 72, 153, 0.15)',
    typeLabel: 'Áudio Ogg Vorbis',
    category: 'audio',
  },
  aac: {
    badge: 'AAC',
    color: '#ec4899',
    bgTint: 'rgba(236, 72, 153, 0.15)',
    typeLabel: 'Áudio AAC',
    category: 'audio',
  },
  m4a: {
    badge: 'M4A',
    color: '#ec4899',
    bgTint: 'rgba(236, 72, 153, 0.15)',
    typeLabel: 'Áudio M4A',
    category: 'audio',
  },
  opus: {
    badge: 'OPUS',
    color: '#ec4899',
    bgTint: 'rgba(236, 72, 153, 0.15)',
    typeLabel: 'Áudio Opus',
    category: 'audio',
  },

  // Imagens & Design
  png: {
    badge: 'PNG',
    color: '#06b6d4',
    bgTint: 'rgba(6, 182, 212, 0.14)',
    typeLabel: 'Imagem PNG',
    category: 'image',
  },
  jpg: {
    badge: 'JPG',
    color: '#06b6d4',
    bgTint: 'rgba(6, 182, 212, 0.14)',
    typeLabel: 'Imagem JPEG',
    category: 'image',
  },
  jpeg: {
    badge: 'JPEG',
    color: '#06b6d4',
    bgTint: 'rgba(6, 182, 212, 0.14)',
    typeLabel: 'Imagem JPEG',
    category: 'image',
  },
  gif: {
    badge: 'GIF',
    color: '#06b6d4',
    bgTint: 'rgba(6, 182, 212, 0.14)',
    typeLabel: 'Imagem Animada GIF',
    category: 'image',
  },
  webp: {
    badge: 'WEBP',
    color: '#06b6d4',
    bgTint: 'rgba(6, 182, 212, 0.14)',
    typeLabel: 'Imagem WebP',
    category: 'image',
  },
  bmp: {
    badge: 'BMP',
    color: '#06b6d4',
    bgTint: 'rgba(6, 182, 212, 0.14)',
    typeLabel: 'Imagem Bitmap (.bmp)',
    category: 'image',
  },
  ico: {
    badge: 'ICO',
    color: '#06b6d4',
    bgTint: 'rgba(6, 182, 212, 0.14)',
    typeLabel: 'Ícone do Sistema (.ico)',
    category: 'image',
  },
  avif: {
    badge: 'AVIF',
    color: '#06b6d4',
    bgTint: 'rgba(6, 182, 212, 0.14)',
    typeLabel: 'Imagem AVIF',
    category: 'image',
  },
  svg: {
    badge: 'SVG',
    color: '#f97316',
    bgTint: 'rgba(249, 115, 22, 0.14)',
    typeLabel: 'Gráfico Vetorial SVG',
    category: 'vector',
  },
  psd: {
    badge: 'PSD',
    color: '#3b82f6',
    bgTint: 'rgba(59, 130, 246, 0.14)',
    typeLabel: 'Projeto Adobe Photoshop',
    category: 'vector',
  },
  ai: {
    badge: 'AI',
    color: '#f97316',
    bgTint: 'rgba(249, 115, 22, 0.14)',
    typeLabel: 'Projeto Adobe Illustrator',
    category: 'vector',
  },
  fig: {
    badge: 'FIG',
    color: '#ec4899',
    bgTint: 'rgba(236, 72, 153, 0.14)',
    typeLabel: 'Design Figma (.fig)',
    category: 'vector',
  },

  // Bancos de Dados & SQL
  db: {
    badge: 'DB',
    color: '#0ea5e9',
    bgTint: 'rgba(14, 165, 233, 0.15)',
    typeLabel: 'Banco de Dados SQLite (.db)',
    category: 'database',
  },
  sqlite: {
    badge: 'SQLITE',
    color: '#0ea5e9',
    bgTint: 'rgba(14, 165, 233, 0.15)',
    typeLabel: 'Banco de Dados SQLite',
    category: 'database',
  },
  sqlite3: {
    badge: 'SQLITE3',
    color: '#0ea5e9',
    bgTint: 'rgba(14, 165, 233, 0.15)',
    typeLabel: 'Banco de Dados SQLite 3',
    category: 'database',
  },
  db3: {
    badge: 'DB3',
    color: '#0ea5e9',
    bgTint: 'rgba(14, 165, 233, 0.15)',
    typeLabel: 'Banco de Dados SQLite (.db3)',
    category: 'database',
  },
  s3db: {
    badge: 'S3DB',
    color: '#0ea5e9',
    bgTint: 'rgba(14, 165, 233, 0.15)',
    typeLabel: 'Banco de Dados SQLite',
    category: 'database',
  },
  sql: {
    badge: 'SQL',
    color: '#ec4899',
    bgTint: 'rgba(236, 72, 153, 0.14)',
    typeLabel: 'Script de Consulta SQL',
    category: 'sql',
  },

  // Arquivos Compactados & Imagens de Disco
  zip: {
    badge: 'ZIP',
    color: '#d97706',
    bgTint: 'rgba(217, 119, 6, 0.15)',
    typeLabel: 'Arquivo Compactado ZIP',
    category: 'archive',
  },
  rar: {
    badge: 'RAR',
    color: '#d97706',
    bgTint: 'rgba(217, 119, 6, 0.15)',
    typeLabel: 'Arquivo Compactado RAR',
    category: 'archive',
  },
  '7z': {
    badge: '7Z',
    color: '#d97706',
    bgTint: 'rgba(217, 119, 6, 0.15)',
    typeLabel: 'Arquivo Compactado 7-Zip',
    category: 'archive',
  },
  tar: {
    badge: 'TAR',
    color: '#d97706',
    bgTint: 'rgba(217, 119, 6, 0.15)',
    typeLabel: 'Pacote TAR',
    category: 'archive',
  },
  gz: {
    badge: 'GZ',
    color: '#d97706',
    bgTint: 'rgba(217, 119, 6, 0.15)',
    typeLabel: 'Arquivo Compactado Gzip',
    category: 'archive',
  },
  tgz: {
    badge: 'TGZ',
    color: '#d97706',
    bgTint: 'rgba(217, 119, 6, 0.15)',
    typeLabel: 'Pacote TAR.GZ',
    category: 'archive',
  },
  bz2: {
    badge: 'BZ2',
    color: '#d97706',
    bgTint: 'rgba(217, 119, 6, 0.15)',
    typeLabel: 'Arquivo Compactado Bzip2',
    category: 'archive',
  },
  xz: {
    badge: 'XZ',
    color: '#d97706',
    bgTint: 'rgba(217, 119, 6, 0.15)',
    typeLabel: 'Arquivo Compactado XZ',
    category: 'archive',
  },
  iso: {
    badge: 'ISO',
    color: '#8b5cf6',
    bgTint: 'rgba(139, 92, 246, 0.14)',
    typeLabel: 'Imagem de Disco Óptico (.iso)',
    category: 'disk',
  },
  img: {
    badge: 'IMG',
    color: '#8b5cf6',
    bgTint: 'rgba(139, 92, 246, 0.14)',
    typeLabel: 'Imagem de Disco (.img)',
    category: 'disk',
  },

  // Linguagens de Programação
  go: {
    badge: 'GO',
    color: '#00add8',
    bgTint: 'rgba(0, 173, 216, 0.15)',
    typeLabel: 'Código-Fonte Go (.go)',
    category: 'code',
  },
  mod: {
    badge: 'MOD',
    color: '#00add8',
    bgTint: 'rgba(0, 173, 216, 0.15)',
    typeLabel: 'Módulo Go (go.mod)',
    category: 'code',
  },
  sum: {
    badge: 'SUM',
    color: '#00add8',
    bgTint: 'rgba(0, 173, 216, 0.12)',
    typeLabel: 'Checksum Go (go.sum)',
    category: 'config',
  },
  ts: {
    badge: 'TS',
    color: '#3178c6',
    bgTint: 'rgba(49, 120, 198, 0.15)',
    typeLabel: 'Código TypeScript (.ts)',
    category: 'code',
  },
  tsx: {
    badge: 'TSX',
    color: '#3178c6',
    bgTint: 'rgba(49, 120, 198, 0.15)',
    typeLabel: 'Componente React TypeScript (.tsx)',
    category: 'code',
  },
  js: {
    badge: 'JS',
    color: '#eab308',
    bgTint: 'rgba(234, 179, 8, 0.15)',
    typeLabel: 'Código JavaScript (.js)',
    category: 'code',
  },
  jsx: {
    badge: 'JSX',
    color: '#eab308',
    bgTint: 'rgba(234, 179, 8, 0.15)',
    typeLabel: 'Componente React JSX (.jsx)',
    category: 'code',
  },
  mjs: {
    badge: 'MJS',
    color: '#eab308',
    bgTint: 'rgba(234, 179, 8, 0.15)',
    typeLabel: 'Módulo ES JavaScript (.mjs)',
    category: 'code',
  },
  cjs: {
    badge: 'CJS',
    color: '#eab308',
    bgTint: 'rgba(234, 179, 8, 0.15)',
    typeLabel: 'Módulo CommonJS (.cjs)',
    category: 'code',
  },
  py: {
    badge: 'PY',
    color: '#3b82f6',
    bgTint: 'rgba(59, 130, 246, 0.15)',
    typeLabel: 'Script Python (.py)',
    category: 'code',
  },
  ipynb: {
    badge: 'NB',
    color: '#f97316',
    bgTint: 'rgba(249, 115, 22, 0.15)',
    typeLabel: 'Jupyter Notebook (.ipynb)',
    category: 'code',
  },
  rs: {
    badge: 'RS',
    color: '#f97316',
    bgTint: 'rgba(249, 115, 22, 0.15)',
    typeLabel: 'Código-Fonte Rust (.rs)',
    category: 'code',
  },
  html: {
    badge: 'HTML',
    color: '#e34f26',
    bgTint: 'rgba(227, 79, 38, 0.15)',
    typeLabel: 'Documento HTML',
    category: 'code',
  },
  htm: {
    badge: 'HTM',
    color: '#e34f26',
    bgTint: 'rgba(227, 79, 38, 0.15)',
    typeLabel: 'Documento HTML',
    category: 'code',
  },
  css: {
    badge: 'CSS',
    color: '#2965f1',
    bgTint: 'rgba(41, 101, 241, 0.15)',
    typeLabel: 'Folha de Estilo CSS',
    category: 'code',
  },
  scss: {
    badge: 'SCSS',
    color: '#ec4899',
    bgTint: 'rgba(236, 72, 153, 0.15)',
    typeLabel: 'Folha de Estilo Sass (.scss)',
    category: 'code',
  },
  c: {
    badge: 'C',
    color: '#0284c7',
    bgTint: 'rgba(2, 132, 199, 0.15)',
    typeLabel: 'Código-Fonte C (.c)',
    category: 'code',
  },
  cpp: {
    badge: 'C++',
    color: '#0284c7',
    bgTint: 'rgba(2, 132, 199, 0.15)',
    typeLabel: 'Código-Fonte C++ (.cpp)',
    category: 'code',
  },
  h: {
    badge: 'H',
    color: '#0284c7',
    bgTint: 'rgba(2, 132, 199, 0.15)',
    typeLabel: 'Cabeçalho C/C++ (.h)',
    category: 'code',
  },
  hpp: {
    badge: 'HPP',
    color: '#0284c7',
    bgTint: 'rgba(2, 132, 199, 0.15)',
    typeLabel: 'Cabeçalho C++ (.hpp)',
    category: 'code',
  },
  cs: {
    badge: 'C#',
    color: '#9333ea',
    bgTint: 'rgba(147, 51, 234, 0.15)',
    typeLabel: 'Código-Fonte C# (.cs)',
    category: 'code',
  },
  java: {
    badge: 'JAVA',
    color: '#ea580c',
    bgTint: 'rgba(234, 88, 12, 0.15)',
    typeLabel: 'Código-Fonte Java (.java)',
    category: 'code',
  },
  kt: {
    badge: 'KT',
    color: '#8b5cf6',
    bgTint: 'rgba(139, 92, 246, 0.15)',
    typeLabel: 'Código-Fonte Kotlin (.kt)',
    category: 'code',
  },
  php: {
    badge: 'PHP',
    color: '#6366f1',
    bgTint: 'rgba(99, 102, 241, 0.15)',
    typeLabel: 'Script PHP (.php)',
    category: 'code',
  },
  rb: {
    badge: 'RB',
    color: '#e11d48',
    bgTint: 'rgba(225, 29, 72, 0.15)',
    typeLabel: 'Script Ruby (.rb)',
    category: 'code',
  },
  vue: {
    badge: 'VUE',
    color: '#10b981',
    bgTint: 'rgba(16, 185, 129, 0.15)',
    typeLabel: 'Componente Vue (.vue)',
    category: 'code',
  },
  svelte: {
    badge: 'SVL',
    color: '#ff3e00',
    bgTint: 'rgba(255, 62, 0, 0.15)',
    typeLabel: 'Componente Svelte',
    category: 'code',
  },

  // Scripts de Terminal & Automação
  sh: {
    badge: 'SH',
    color: '#22c55e',
    bgTint: 'rgba(34, 197, 94, 0.14)',
    typeLabel: 'Script Shell (.sh)',
    category: 'script',
  },
  bash: {
    badge: 'BASH',
    color: '#22c55e',
    bgTint: 'rgba(34, 197, 94, 0.14)',
    typeLabel: 'Script Bash',
    category: 'script',
  },
  ps1: {
    badge: 'PS1',
    color: '#38bdf8',
    bgTint: 'rgba(56, 189, 248, 0.14)',
    typeLabel: 'Script PowerShell (.ps1)',
    category: 'script',
  },
  bat: {
    badge: 'BAT',
    color: '#22c55e',
    bgTint: 'rgba(34, 197, 94, 0.14)',
    typeLabel: 'Script em Lotes (.bat)',
    category: 'script',
  },
  cmd: {
    badge: 'CMD',
    color: '#22c55e',
    bgTint: 'rgba(34, 197, 94, 0.14)',
    typeLabel: 'Script de Comando Windows (.cmd)',
    category: 'script',
  },

  // Configurações (YAML, TOML, XML, INI, ENV)
  yaml: {
    badge: 'YAML',
    color: '#a855f7',
    bgTint: 'rgba(168, 85, 247, 0.14)',
    typeLabel: 'Configuração YAML',
    category: 'config',
  },
  yml: {
    badge: 'YML',
    color: '#a855f7',
    bgTint: 'rgba(168, 85, 247, 0.14)',
    typeLabel: 'Configuração YAML (.yml)',
    category: 'config',
  },
  toml: {
    badge: 'TOML',
    color: '#94a3b8',
    bgTint: 'rgba(148, 163, 184, 0.14)',
    typeLabel: 'Configuração TOML',
    category: 'config',
  },
  xml: {
    badge: 'XML',
    color: '#f97316',
    bgTint: 'rgba(249, 115, 22, 0.14)',
    typeLabel: 'Documento XML',
    category: 'config',
  },
  ini: {
    badge: 'INI',
    color: '#94a3b8',
    bgTint: 'rgba(148, 163, 184, 0.14)',
    typeLabel: 'Arquivo de Configuração (.ini)',
    category: 'config',
  },
  cfg: {
    badge: 'CFG',
    color: '#94a3b8',
    bgTint: 'rgba(148, 163, 184, 0.14)',
    typeLabel: 'Arquivo de Configuração (.cfg)',
    category: 'config',
  },
  conf: {
    badge: 'CONF',
    color: '#94a3b8',
    bgTint: 'rgba(148, 163, 184, 0.14)',
    typeLabel: 'Arquivo de Configuração (.conf)',
    category: 'config',
  },
  env: {
    badge: 'ENV',
    color: '#eab308',
    bgTint: 'rgba(234, 179, 8, 0.14)',
    typeLabel: 'Variáveis de Ambiente (.env)',
    category: 'config',
  },
  lock: {
    badge: 'LOCK',
    color: '#64748b',
    bgTint: 'rgba(100, 116, 139, 0.14)',
    typeLabel: ' manifesto de bloqueio (.lock)',
    category: 'config',
  },

  // Certificados & Chaves
  pem: {
    badge: 'PEM',
    color: '#10b981',
    bgTint: 'rgba(16, 185, 129, 0.14)',
    typeLabel: 'Certificado / Chave PEM',
    category: 'security',
  },
  crt: {
    badge: 'CRT',
    color: '#10b981',
    bgTint: 'rgba(16, 185, 129, 0.14)',
    typeLabel: 'Certificado Digital (.crt)',
    category: 'security',
  },
  key: {
    badge: 'KEY',
    color: '#f59e0b',
    bgTint: 'rgba(245, 158, 11, 0.14)',
    typeLabel: 'Chave Privada (.key)',
    category: 'security',
  },
  pub: {
    badge: 'PUB',
    color: '#10b981',
    bgTint: 'rgba(16, 185, 129, 0.14)',
    typeLabel: 'Chave Pública (.pub)',
    category: 'security',
  },

  // Fontes Tipográficas
  ttf: {
    badge: 'TTF',
    color: '#8b5cf6',
    bgTint: 'rgba(139, 92, 246, 0.14)',
    typeLabel: 'Fonte TrueType (.ttf)',
    category: 'font',
  },
  otf: {
    badge: 'OTF',
    color: '#8b5cf6',
    bgTint: 'rgba(139, 92, 246, 0.14)',
    typeLabel: 'Fonte OpenType (.otf)',
    category: 'font',
  },
  woff: {
    badge: 'WOFF',
    color: '#8b5cf6',
    bgTint: 'rgba(139, 92, 246, 0.14)',
    typeLabel: 'Fonte Web (.woff)',
    category: 'font',
  },
  woff2: {
    badge: 'WOFF2',
    color: '#8b5cf6',
    bgTint: 'rgba(139, 92, 246, 0.14)',
    typeLabel: 'Fonte Web (.woff2)',
    category: 'font',
  },

  // Texto & Logs
  txt: {
    badge: 'TXT',
    color: '#94a3b8',
    bgTint: 'rgba(148, 163, 184, 0.12)',
    typeLabel: 'Documento de Texto (.txt)',
    category: 'text',
  },
  log: {
    badge: 'LOG',
    color: '#64748b',
    bgTint: 'rgba(100, 116, 139, 0.14)',
    typeLabel: 'Registro de Log (.log)',
    category: 'log',
  },
};

export function getFileTypeVisual(
  name: string,
  kind: 'file' | 'dir' | 'symlink' | string = 'file'
): FileTypeVisual {
  const lower = (name || '').toLowerCase();

  if (kind === 'dir') {
    if (lower === '.git' || lower === '.github') {
      return {
        ext: 'dir',
        badge: 'GIT',
        color: '#f97316',
        bgTint: 'rgba(249, 115, 22, 0.14)',
        typeLabel: 'Pasta de Repositório Git',
        category: 'folder',
      };
    }
    if (lower === 'node_modules' || lower === 'vendor' || lower === '.venv' || lower === 'venv') {
      return {
        ext: 'dir',
        badge: 'DEPS',
        color: '#22c55e',
        bgTint: 'rgba(34, 197, 94, 0.14)',
        typeLabel: 'Pasta de Dependências',
        category: 'folder',
      };
    }
    if (lower === 'src' || lower === 'app' || lower === 'internal' || lower === 'pkg' || lower === 'cmd') {
      return {
        ext: 'dir',
        badge: 'SRC',
        color: '#38bdf8',
        bgTint: 'rgba(56, 189, 248, 0.14)',
        typeLabel: 'Pasta de Código-Fonte',
        category: 'folder',
      };
    }
    if (lower === 'build' || lower === 'dist' || lower === 'out' || lower === 'bin' || lower === 'target') {
      return {
        ext: 'dir',
        badge: 'BUILD',
        color: '#f59e0b',
        bgTint: 'rgba(245, 158, 11, 0.14)',
        typeLabel: 'Pasta de Compilação / Build',
        category: 'folder',
      };
    }
    return {
      ext: 'dir',
      badge: 'DIR',
      color: '#38bdf8',
      bgTint: 'rgba(56, 189, 248, 0.14)',
      typeLabel: 'Pasta de arquivos',
      category: 'folder',
    };
  }

  if (kind === 'symlink') {
    return {
      ext: 'symlink',
      badge: 'LINK',
      color: '#a78bfa',
      bgTint: 'rgba(167, 139, 250, 0.14)',
      typeLabel: 'Atalho / Link Simbólico',
      category: 'symlink',
    };
  }

  // Nomes de arquivos especiais sem extensão padrão
  if (lower === 'dockerfile' || lower.startsWith('dockerfile.')) {
    return {
      ext: 'dockerfile',
      badge: 'DOCKER',
      color: '#2496ed',
      bgTint: 'rgba(36, 150, 237, 0.15)',
      typeLabel: 'Container Dockerfile',
      category: 'config',
    };
  }
  if (lower === 'makefile' || lower === 'gnumakefile') {
    return {
      ext: 'makefile',
      badge: 'MAKE',
      color: '#f59e0b',
      bgTint: 'rgba(245, 158, 11, 0.14)',
      typeLabel: 'Script Makefile',
      category: 'script',
    };
  }
  if (lower === '.gitignore' || lower === '.gitattributes' || lower === '.gitmodules') {
    return {
      ext: 'git',
      badge: 'GIT',
      color: '#f05032',
      bgTint: 'rgba(240, 80, 50, 0.14)',
      typeLabel: 'Configuração do Git',
      category: 'config',
    };
  }
  if (lower === '.env' || lower.startsWith('.env.')) {
    return {
      ext: 'env',
      badge: 'ENV',
      color: '#eab308',
      bgTint: 'rgba(234, 179, 8, 0.14)',
      typeLabel: 'Variáveis de Ambiente (.env)',
      category: 'config',
    };
  }

  const dotIdx = lower.lastIndexOf('.');
  const ext = dotIdx >= 0 && dotIdx < lower.length - 1 ? lower.slice(dotIdx + 1) : '';
  const mapped = ext ? EXTENSION_VISUAL_MAP[ext] : undefined;

  if (mapped) {
    return { ext, ...mapped };
  }

  if (ext) {
    return {
      ext,
      badge: ext.slice(0, 4).toUpperCase(),
      color: '#94a3b8',
      bgTint: 'rgba(148, 163, 184, 0.12)',
      typeLabel: `Arquivo ${ext.toUpperCase()}`,
      category: 'generic',
    };
  }

  return {
    ext: '',
    badge: 'FILE',
    color: '#94a3b8',
    bgTint: 'rgba(148, 163, 184, 0.12)',
    typeLabel: 'Arquivo',
    category: 'generic',
  };
}

function renderGlyphForVisual(visual: FileTypeVisual, lowerName: string, iconSize: number) {
  const style: React.CSSProperties = { color: visual.color, flexShrink: 0 };

  if (visual.category === 'folder') {
    if (lowerName === '.git' || lowerName === '.github') {
      return <FolderGit2 size={iconSize} style={style} />;
    }
    if (lowerName === 'src' || lowerName === 'app' || lowerName === 'internal') {
      return <FolderCode size={iconSize} style={style} />;
    }
    if (lowerName === 'node_modules' || lowerName === 'build' || lowerName === 'dist') {
      return <FolderCog size={iconSize} style={style} />;
    }
    return <Folder size={iconSize} style={style} />;
  }

  switch (visual.category) {
    case 'symlink':
      return <CornerDownRight size={iconSize} style={style} />;
    case 'pdf':
      return <FileCheck2 size={iconSize} style={style} />;
    case 'word':
      return <FileText size={iconSize} style={style} />;
    case 'spreadsheet':
      return <FileSpreadsheet size={iconSize} style={style} />;
    case 'csv':
      return <Table2 size={iconSize} style={style} />;
    case 'presentation':
      return <Presentation size={iconSize} style={style} />;
    case 'json':
      return <FileJson size={iconSize} style={style} />;
    case 'markdown':
      return <BookOpen size={iconSize} style={style} />;
    case 'executable':
      return <AppWindow size={iconSize} style={style} />;
    case 'binary':
      return <Cpu size={iconSize} style={style} />;
    case 'video':
      return <FileVideo size={iconSize} style={style} />;
    case 'audio':
      return <FileAudio size={iconSize} style={style} />;
    case 'image':
      return <FileImage size={iconSize} style={style} />;
    case 'vector':
      return <Palette size={iconSize} style={style} />;
    case 'database':
    case 'sql':
      return <Database size={iconSize} style={style} />;
    case 'archive':
      return <FileArchive size={iconSize} style={style} />;
    case 'disk':
      return <Disc size={iconSize} style={style} />;
    case 'code':
      return <FileCode2 size={iconSize} style={style} />;
    case 'script':
      return <FileTerminal size={iconSize} style={style} />;
    case 'config':
      return <Settings size={iconSize} style={style} />;
    case 'security':
      return visual.ext === 'key' ? (
        <FileKey size={iconSize} style={style} />
      ) : (
        <Shield size={iconSize} style={style} />
      );
    case 'font':
      return <FileType size={iconSize} style={style} />;
    case 'log':
      return <ScrollText size={iconSize} style={style} />;
    case 'text':
      return <FileText size={iconSize} style={style} />;
    default:
      return <File size={iconSize} style={style} />;
  }
}

export interface FileTypeIconProps {
  name: string;
  kind?: 'file' | 'dir' | 'symlink' | string;
  size?: number;
  showBadge?: boolean;
}

export const FileTypeIcon: React.FC<FileTypeIconProps> = ({
  name,
  kind = 'file',
  size = 16,
  showBadge = true,
}) => {
  const visual = getFileTypeVisual(name, kind);
  const lowerName = (name || '').toLowerCase();

  // Modo Grande (ex: Visualização em Grade / Preview Header >= 24px)
  if (size >= 24) {
    return (
      <div
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size + 16,
          height: size + 16,
          borderRadius: '10px',
          backgroundColor: visual.bgTint,
          border: `1px solid ${visual.color}33`,
          flexShrink: 0,
        }}
      >
        {renderGlyphForVisual(visual, lowerName, size)}
        {showBadge && visual.category !== 'folder' && visual.badge && (
          <span
            style={{
              position: 'absolute',
              bottom: '2px',
              right: '2px',
              padding: '1px 4px',
              borderRadius: '4px',
              backgroundColor: visual.color,
              color: '#ffffff',
              fontSize: size >= 34 ? '9px' : '8px',
              fontWeight: 800,
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.02em',
              lineHeight: 1.15,
              boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
            }}
          >
            {visual.badge.slice(0, 4)}
          </span>
        )}
      </div>
    );
  }

  // Modo Compacto de Linha (DetailsView, SecondaryPane, SearchDrawer, Miller Columns, Editor Tree)
  const showInlineBadge =
    showBadge &&
    visual.category !== 'folder' &&
    visual.category !== 'symlink' &&
    visual.category !== 'generic' &&
    visual.badge.length <= 4;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size + 5,
          height: size + 5,
          borderRadius: '5px',
          backgroundColor: visual.bgTint,
          flexShrink: 0,
        }}
      >
        {renderGlyphForVisual(visual, lowerName, size - 1)}
      </span>
      {showInlineBadge && (
        <span
          style={{
            fontSize: '9px',
            fontWeight: 800,
            fontFamily: 'var(--font-mono)',
            padding: '0px 3.5px',
            borderRadius: '3px',
            color: visual.color,
            backgroundColor: visual.bgTint,
            border: `1px solid ${visual.color}40`,
            lineHeight: '13px',
            letterSpacing: '0.01em',
            userSelect: 'none',
          }}
        >
          {visual.badge}
        </span>
      )}
    </span>
  );
};

