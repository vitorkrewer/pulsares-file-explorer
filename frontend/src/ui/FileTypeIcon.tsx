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
  psql: {
    badge: 'PSQL',
    color: '#38bdf8',
    bgTint: 'rgba(56, 189, 248, 0.15)',
    typeLabel: 'Script PostgreSQL (.psql)',
    category: 'sql',
  },
  plsql: {
    badge: 'PLSQL',
    color: '#ef4444',
    bgTint: 'rgba(239, 68, 68, 0.14)',
    typeLabel: 'Script Oracle PL/SQL',
    category: 'sql',
  },
  tsql: {
    badge: 'TSQL',
    color: '#ef4444',
    bgTint: 'rgba(239, 68, 68, 0.14)',
    typeLabel: 'Script SQL Server (T-SQL)',
    category: 'sql',
  },
  cql: {
    badge: 'CQL',
    color: '#0ea5e9',
    bgTint: 'rgba(14, 165, 233, 0.15)',
    typeLabel: 'Script Cassandra / Cypher (.cql)',
    category: 'sql',
  },
  duckdb: {
    badge: 'DUCK',
    color: '#eab308',
    bgTint: 'rgba(234, 179, 8, 0.15)',
    typeLabel: 'Banco Analítico DuckDB (.duckdb)',
    category: 'database',
  },
  sqlitedb: {
    badge: 'SQLITE',
    color: '#0ea5e9',
    bgTint: 'rgba(14, 165, 233, 0.15)',
    typeLabel: 'Banco de Dados SQLite',
    category: 'database',
  },
  sl3: {
    badge: 'SL3',
    color: '#0ea5e9',
    bgTint: 'rgba(14, 165, 233, 0.15)',
    typeLabel: 'Banco de Dados SQLite 3',
    category: 'database',
  },
  mdf: {
    badge: 'MDF',
    color: '#ef4444',
    bgTint: 'rgba(239, 68, 68, 0.14)',
    typeLabel: 'Banco Microsoft SQL Server (.mdf)',
    category: 'database',
  },
  ldf: {
    badge: 'LDF',
    color: '#ef4444',
    bgTint: 'rgba(239, 68, 68, 0.14)',
    typeLabel: 'Log de Transações SQL Server (.ldf)',
    category: 'database',
  },
  ndf: {
    badge: 'NDF',
    color: '#ef4444',
    bgTint: 'rgba(239, 68, 68, 0.14)',
    typeLabel: 'Dados Secundários SQL Server (.ndf)',
    category: 'database',
  },
  mdb: {
    badge: 'MDB',
    color: '#e11d48',
    bgTint: 'rgba(225, 29, 72, 0.14)',
    typeLabel: 'Banco Microsoft Access (.mdb)',
    category: 'database',
  },
  accdb: {
    badge: 'ACCDB',
    color: '#e11d48',
    bgTint: 'rgba(225, 29, 72, 0.14)',
    typeLabel: 'Banco Microsoft Access (.accdb)',
    category: 'database',
  },
  dbf: {
    badge: 'DBF',
    color: '#0284c7',
    bgTint: 'rgba(2, 132, 199, 0.15)',
    typeLabel: 'Tabela de Banco dBASE (.dbf)',
    category: 'database',
  },
  rdb: {
    badge: 'REDIS',
    color: '#dc2626',
    bgTint: 'rgba(220, 38, 38, 0.15)',
    typeLabel: 'Snapshot de Banco Redis (.rdb)',
    category: 'database',
  },
  bson: {
    badge: 'MONGO',
    color: '#10b981',
    bgTint: 'rgba(16, 185, 129, 0.15)',
    typeLabel: 'Dump Binário MongoDB (.bson)',
    category: 'database',
  },
  dump: {
    badge: 'DUMP',
    color: '#0ea5e9',
    bgTint: 'rgba(14, 165, 233, 0.15)',
    typeLabel: 'Dump de Banco de Dados (.dump)',
    category: 'database',
  },
  dmp: {
    badge: 'DMP',
    color: '#0ea5e9',
    bgTint: 'rgba(14, 165, 233, 0.15)',
    typeLabel: 'Exportação de Banco de Dados (.dmp)',
    category: 'database',
  },
  bak: {
    badge: 'BAK',
    color: '#0ea5e9',
    bgTint: 'rgba(14, 165, 233, 0.14)',
    typeLabel: 'Backup de Banco / Dados (.bak)',
    category: 'database',
  },
  prisma: {
    badge: 'PRISMA',
    color: '#14b8a6',
    bgTint: 'rgba(20, 184, 166, 0.15)',
    typeLabel: 'Schema de Banco Prisma (.prisma)',
    category: 'database',
  },
  graphql: {
    badge: 'GQL',
    color: '#e10098',
    bgTint: 'rgba(225, 0, 152, 0.15)',
    typeLabel: 'Schema / Query GraphQL (.graphql)',
    category: 'code',
  },
  gql: {
    badge: 'GQL',
    color: '#e10098',
    bgTint: 'rgba(225, 0, 152, 0.15)',
    typeLabel: 'Query GraphQL (.gql)',
    category: 'code',
  },
  proto: {
    badge: 'PROTO',
    color: '#10b981',
    bgTint: 'rgba(16, 185, 129, 0.15)',
    typeLabel: 'Contrato Protocol Buffers (.proto)',
    category: 'code',
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
  astro: {
    badge: 'ASTRO',
    color: '#f97316',
    bgTint: 'rgba(249, 115, 22, 0.15)',
    typeLabel: 'Componente Astro (.astro)',
    category: 'code',
  },
  dart: {
    badge: 'DART',
    color: '#0175c2',
    bgTint: 'rgba(1, 117, 194, 0.15)',
    typeLabel: 'Código Dart / Flutter (.dart)',
    category: 'code',
  },
  swift: {
    badge: 'SWIFT',
    color: '#f05138',
    bgTint: 'rgba(240, 81, 56, 0.15)',
    typeLabel: 'Código-Fonte Swift (.swift)',
    category: 'code',
  },
  lua: {
    badge: 'LUA',
    color: '#2563eb',
    bgTint: 'rgba(37, 99, 235, 0.15)',
    typeLabel: 'Script Lua (.lua)',
    category: 'code',
  },
  r: {
    badge: 'R',
    color: '#2563eb',
    bgTint: 'rgba(37, 99, 235, 0.15)',
    typeLabel: 'Script Estatístico R (.r)',
    category: 'code',
  },
  jl: {
    badge: 'JL',
    color: '#9333ea',
    bgTint: 'rgba(147, 51, 234, 0.15)',
    typeLabel: 'Código-Fonte Julia (.jl)',
    category: 'code',
  },
  ex: {
    badge: 'EX',
    color: '#9333ea',
    bgTint: 'rgba(147, 51, 234, 0.15)',
    typeLabel: 'Código-Fonte Elixir (.ex)',
    category: 'code',
  },
  exs: {
    badge: 'EXS',
    color: '#9333ea',
    bgTint: 'rgba(147, 51, 234, 0.15)',
    typeLabel: 'Script Elixir (.exs)',
    category: 'code',
  },
  scala: {
    badge: 'SCALA',
    color: '#dc2626',
    bgTint: 'rgba(220, 38, 38, 0.15)',
    typeLabel: 'Código-Fonte Scala (.scala)',
    category: 'code',
  },
  clj: {
    badge: 'CLJ',
    color: '#16a34a',
    bgTint: 'rgba(22, 163, 74, 0.15)',
    typeLabel: 'Código-Fonte Clojure (.clj)',
    category: 'code',
  },
  hs: {
    badge: 'HS',
    color: '#8b5cf6',
    bgTint: 'rgba(139, 92, 246, 0.15)',
    typeLabel: 'Código-Fonte Haskell (.hs)',
    category: 'code',
  },
  zig: {
    badge: 'ZIG',
    color: '#f59e0b',
    bgTint: 'rgba(245, 158, 11, 0.15)',
    typeLabel: 'Código-Fonte Zig (.zig)',
    category: 'code',
  },
  sol: {
    badge: 'SOL',
    color: '#6366f1',
    bgTint: 'rgba(99, 102, 241, 0.15)',
    typeLabel: 'Smart Contract Solidity (.sol)',
    category: 'code',
  },
  tf: {
    badge: 'TF',
    color: '#7c3aed',
    bgTint: 'rgba(124, 58, 237, 0.15)',
    typeLabel: 'Infraestrutura Terraform (.tf)',
    category: 'config',
  },
  tfvars: {
    badge: 'TFV',
    color: '#7c3aed',
    bgTint: 'rgba(124, 58, 237, 0.15)',
    typeLabel: 'Variáveis Terraform (.tfvars)',
    category: 'config',
  },
  hcl: {
    badge: 'HCL',
    color: '#7c3aed',
    bgTint: 'rgba(124, 58, 237, 0.15)',
    typeLabel: 'Configuração HashiCorp (.hcl)',
    category: 'config',
  },
  gradle: {
    badge: 'GRD',
    color: '#0284c7',
    bgTint: 'rgba(2, 132, 199, 0.15)',
    typeLabel: 'Script de Build Gradle (.gradle)',
    category: 'config',
  },
  kts: {
    badge: 'KTS',
    color: '#8b5cf6',
    bgTint: 'rgba(139, 92, 246, 0.15)',
    typeLabel: 'Kotlin Script (.kts)',
    category: 'code',
  },
  jar: {
    badge: 'JAR',
    color: '#ea580c',
    bgTint: 'rgba(234, 88, 12, 0.15)',
    typeLabel: 'Pacote Java Archive (.jar)',
    category: 'executable',
  },
  csproj: {
    badge: 'CSPRJ',
    color: '#9333ea',
    bgTint: 'rgba(147, 51, 234, 0.15)',
    typeLabel: 'Projeto .NET C# (.csproj)',
    category: 'config',
  },
  sln: {
    badge: 'SLN',
    color: '#9333ea',
    bgTint: 'rgba(147, 51, 234, 0.15)',
    typeLabel: 'Solução Visual Studio (.sln)',
    category: 'config',
  },
  fs: {
    badge: 'F#',
    color: '#0ea5e9',
    bgTint: 'rgba(14, 165, 233, 0.15)',
    typeLabel: 'Código-Fonte F# (.fs)',
    category: 'code',
  },
  less: {
    badge: 'LESS',
    color: '#2563eb',
    bgTint: 'rgba(37, 99, 235, 0.15)',
    typeLabel: 'Folha de Estilo Less (.less)',
    category: 'code',
  },
  sass: {
    badge: 'SASS',
    color: '#ec4899',
    bgTint: 'rgba(236, 72, 153, 0.15)',
    typeLabel: 'Folha de Estilo Sass (.sass)',
    category: 'code',
  },
  pyw: {
    badge: 'PY',
    color: '#3b82f6',
    bgTint: 'rgba(59, 130, 246, 0.15)',
    typeLabel: 'Script Python GUI (.pyw)',
    category: 'code',
  },
  pyi: {
    badge: 'PYI',
    color: '#3b82f6',
    bgTint: 'rgba(59, 130, 246, 0.15)',
    typeLabel: 'Interface de Tipos Python (.pyi)',
    category: 'code',
  },
  mts: {
    badge: 'MTS',
    color: '#3178c6',
    bgTint: 'rgba(49, 120, 198, 0.15)',
    typeLabel: 'Módulo ES TypeScript (.mts)',
    category: 'code',
  },
  cts: {
    badge: 'CTS',
    color: '#3178c6',
    bgTint: 'rgba(49, 120, 198, 0.15)',
    typeLabel: 'Módulo CommonJS TypeScript (.cts)',
    category: 'code',
  },
  cc: {
    badge: 'C++',
    color: '#0284c7',
    bgTint: 'rgba(2, 132, 199, 0.15)',
    typeLabel: 'Código-Fonte C++ (.cc)',
    category: 'code',
  },
  cxx: {
    badge: 'C++',
    color: '#0284c7',
    bgTint: 'rgba(2, 132, 199, 0.15)',
    typeLabel: 'Código-Fonte C++ (.cxx)',
    category: 'code',
  },
  zsh: {
    badge: 'ZSH',
    color: '#22c55e',
    bgTint: 'rgba(34, 197, 94, 0.14)',
    typeLabel: 'Script Zsh (.zsh)',
    category: 'script',
  },
  fish: {
    badge: 'FISH',
    color: '#22c55e',
    bgTint: 'rgba(34, 197, 94, 0.14)',
    typeLabel: 'Script Fish Shell (.fish)',
    category: 'script',
  },
  diff: {
    badge: 'DIFF',
    color: '#f97316',
    bgTint: 'rgba(249, 115, 22, 0.14)',
    typeLabel: 'Arquivo de Diferenças Git (.diff)',
    category: 'code',
  },
  patch: {
    badge: 'PTCH',
    color: '#f97316',
    bgTint: 'rgba(249, 115, 22, 0.14)',
    typeLabel: 'Patch de Código (.patch)',
    category: 'code',
  },
  http: {
    badge: 'HTTP',
    color: '#0ea5e9',
    bgTint: 'rgba(14, 165, 233, 0.14)',
    typeLabel: 'Requisição HTTP REST (.http)',
    category: 'code',
  },
  rest: {
    badge: 'REST',
    color: '#0ea5e9',
    bgTint: 'rgba(14, 165, 233, 0.14)',
    typeLabel: 'Requisição REST Client (.rest)',
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
    if (lower === '.git' || lower === '.github' || lower === '.gitlab' || lower === '.husky') {
      return {
        ext: 'dir-git',
        badge: 'GIT',
        color: '#f97316',
        bgTint: 'rgba(249, 115, 22, 0.14)',
        typeLabel: 'Pasta de Repositório Git',
        category: 'folder',
      };
    }
    if (
      lower === 'db' ||
      lower === 'database' ||
      lower === 'databases' ||
      lower === 'migrations' ||
      lower === 'sql' ||
      lower === 'prisma' ||
      lower === 'seeds' ||
      lower === 'schema'
    ) {
      return {
        ext: 'dir-db',
        badge: 'DB',
        color: '#0ea5e9',
        bgTint: 'rgba(14, 165, 233, 0.15)',
        typeLabel: 'Pasta de Banco de Dados / Migrations',
        category: 'folder',
      };
    }
    if (
      lower === 'node_modules' ||
      lower === 'vendor' ||
      lower === '.venv' ||
      lower === 'venv' ||
      lower === '__pycache__' ||
      lower === '.pnpm-store'
    ) {
      return {
        ext: 'dir-deps',
        badge: 'DEPS',
        color: '#22c55e',
        bgTint: 'rgba(34, 197, 94, 0.14)',
        typeLabel: 'Pasta de Dependências',
        category: 'folder',
      };
    }
    if (
      lower === 'src' ||
      lower === 'app' ||
      lower === 'internal' ||
      lower === 'pkg' ||
      lower === 'cmd' ||
      lower === 'components' ||
      lower === 'features' ||
      lower === 'lib' ||
      lower === 'hooks' ||
      lower === 'services' ||
      lower === 'api' ||
      lower === 'controllers' ||
      lower === 'models' ||
      lower === 'ui' ||
      lower === 'scripts' ||
      lower === 'tools'
    ) {
      return {
        ext: 'dir-src',
        badge: 'SRC',
        color: '#38bdf8',
        bgTint: 'rgba(56, 189, 248, 0.14)',
        typeLabel: 'Pasta de Código-Fonte / Desenvolvimento',
        category: 'folder',
      };
    }
    if (
      lower === 'build' ||
      lower === 'dist' ||
      lower === 'out' ||
      lower === 'bin' ||
      lower === 'target' ||
      lower === '.next' ||
      lower === '.nuxt'
    ) {
      return {
        ext: 'dir-build',
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

  // Nomes de arquivos especiais de desenvolvimento, programação e banco de dados
  if (
    lower === 'dockerfile' ||
    lower.startsWith('dockerfile.') ||
    lower === 'containerfile' ||
    lower === '.dockerignore' ||
    lower === 'docker-compose.yml' ||
    lower === 'docker-compose.yaml' ||
    lower === 'compose.yml' ||
    lower === 'compose.yaml'
  ) {
    return {
      ext: 'dockerfile',
      badge: 'DOCKER',
      color: '#2496ed',
      bgTint: 'rgba(36, 150, 237, 0.15)',
      typeLabel: 'Configuração de Container Docker',
      category: 'config',
    };
  }
  if (
    lower === 'makefile' ||
    lower === 'gnumakefile' ||
    lower === 'cmakelists.txt' ||
    lower === 'justfile' ||
    lower === 'taskfile.yml' ||
    lower === 'procfile'
  ) {
    return {
      ext: 'makefile',
      badge: 'MAKE',
      color: '#f59e0b',
      bgTint: 'rgba(245, 158, 11, 0.14)',
      typeLabel: 'Script de Automação / Build',
      category: 'script',
    };
  }
  if (
    lower === '.gitignore' ||
    lower === '.gitattributes' ||
    lower === '.gitmodules' ||
    lower === '.gitkeep' ||
    lower === '.mailmap'
  ) {
    return {
      ext: 'git',
      badge: 'GIT',
      color: '#f05032',
      bgTint: 'rgba(240, 80, 50, 0.14)',
      typeLabel: 'Configuração do Repositório Git',
      category: 'config',
    };
  }
  if (
    lower === 'package.json' ||
    lower === 'package-lock.json' ||
    lower === '.npmrc' ||
    lower === '.nvmrc' ||
    lower === 'pnpm-lock.yaml' ||
    lower === 'pnpm-workspace.yaml' ||
    lower === 'yarn.lock' ||
    lower === '.yarnrc' ||
    lower === 'bun.lockb' ||
    lower === 'bun.lock'
  ) {
    return {
      ext: 'npm',
      badge: 'NPM',
      color: '#22c55e',
      bgTint: 'rgba(34, 197, 94, 0.15)',
      typeLabel: 'Manifesto de Pacotes Node.js',
      category: 'code',
    };
  }
  if (
    lower === 'tsconfig.json' ||
    lower.startsWith('tsconfig.') ||
    lower === 'jsconfig.json'
  ) {
    return {
      ext: 'ts',
      badge: 'TS',
      color: '#3178c6',
      bgTint: 'rgba(49, 120, 198, 0.15)',
      typeLabel: 'Configuração do Compilador TypeScript',
      category: 'code',
    };
  }
  if (
    lower === 'go.mod' ||
    lower === 'go.sum' ||
    lower === 'go.work' ||
    lower === 'go.work.sum'
  ) {
    return {
      ext: 'go',
      badge: 'GO',
      color: '#00add8',
      bgTint: 'rgba(0, 173, 216, 0.15)',
      typeLabel: 'Módulo de Projeto Go',
      category: 'code',
    };
  }
  if (lower === 'cargo.toml' || lower === 'cargo.lock' || lower === 'rust-toolchain.toml') {
    return {
      ext: 'rs',
      badge: 'RS',
      color: '#f97316',
      bgTint: 'rgba(249, 115, 22, 0.15)',
      typeLabel: 'Manifesto Cargo (Rust)',
      category: 'code',
    };
  }
  if (
    lower === 'requirements.txt' ||
    lower.startsWith('requirements-') ||
    lower === 'pyproject.toml' ||
    lower === 'pipfile' ||
    lower === 'pipfile.lock' ||
    lower === 'poetry.lock' ||
    lower === '.python-version' ||
    lower === '.flake8'
  ) {
    return {
      ext: 'py',
      badge: 'PY',
      color: '#3b82f6',
      bgTint: 'rgba(59, 130, 246, 0.15)',
      typeLabel: 'Ambiente / Dependências Python',
      category: 'code',
    };
  }
  if (lower === 'composer.json' || lower === 'composer.lock' || lower === 'artisan') {
    return {
      ext: 'php',
      badge: 'PHP',
      color: '#6366f1',
      bgTint: 'rgba(99, 102, 241, 0.15)',
      typeLabel: 'Manifesto PHP Composer',
      category: 'code',
    };
  }
  if (lower === 'gemfile' || lower === 'gemfile.lock' || lower === 'rakefile') {
    return {
      ext: 'rb',
      badge: 'RB',
      color: '#e11d48',
      bgTint: 'rgba(225, 29, 72, 0.15)',
      typeLabel: 'Projeto Ruby / Bundler',
      category: 'code',
    };
  }
  if (
    lower === 'pom.xml' ||
    lower === 'gradlew' ||
    lower === 'gradlew.bat' ||
    lower === 'mvnw' ||
    lower === 'mvnw.cmd'
  ) {
    return {
      ext: 'java',
      badge: 'JVM',
      color: '#ea580c',
      bgTint: 'rgba(234, 88, 12, 0.15)',
      typeLabel: 'Configuração de Build Java (Maven/Gradle)',
      category: 'code',
    };
  }
  if (
    lower.startsWith('.eslintrc') ||
    lower.startsWith('eslint.config.') ||
    lower === '.eslintignore' ||
    lower.startsWith('.prettierrc') ||
    lower.startsWith('prettier.config.') ||
    lower === '.prettierignore' ||
    lower === '.editorconfig' ||
    lower.startsWith('.babelrc') ||
    lower.startsWith('babel.config.')
  ) {
    return {
      ext: 'config',
      badge: 'LINT',
      color: '#a855f7',
      bgTint: 'rgba(168, 85, 247, 0.14)',
      typeLabel: 'Configuração de Linter / Formatador',
      category: 'config',
    };
  }
  if (lower === 'wails.json') {
    return {
      ext: 'json',
      badge: 'WAILS',
      color: '#ef4444',
      bgTint: 'rgba(239, 68, 68, 0.15)',
      typeLabel: 'Projeto Wails Desktop (wails.json)',
      category: 'code',
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

function renderSpecializedDevOrDbSvg(
  visual: FileTypeVisual,
  iconSize: number
): React.ReactNode | null {
  const e = visual.ext;

  // 1. React (.tsx, .jsx) — Átomo Orbital React
  if (e === 'tsx' || e === 'jsx') {
    return (
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="2.2" fill="#06b6d4" />
        <ellipse cx="12" cy="12" rx="10" ry="4.2" stroke="#06b6d4" strokeWidth="1.7" />
        <ellipse
          cx="12"
          cy="12"
          rx="10"
          ry="4.2"
          transform="rotate(60 12 12)"
          stroke="#06b6d4"
          strokeWidth="1.7"
        />
        <ellipse
          cx="12"
          cy="12"
          rx="10"
          ry="4.2"
          transform="rotate(120 12 12)"
          stroke="#06b6d4"
          strokeWidth="1.7"
        />
      </svg>
    );
  }

  // 2. Python (.py, .pyw, .pyi, .ipynb) — Serpentes entrelaçadas Python
  if (e === 'py' || e === 'pyw' || e === 'pyi' || e === 'ipynb') {
    return (
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
        <path
          d="M12 2C7.5 2 8 5 8 5V7H12.5V8H6.5C6.5 8 3 7.8 3 12C3 16.2 6 16 6 16H8V13.5C8 13.5 7.9 11 10.5 11H15C15 11 17 11.1 17 9V4.5C17 4.5 17.3 2 12 2Z"
          fill="#3b82f6"
        />
        <path
          d="M12 22C16.5 22 16 19 16 19V17H11.5V16H17.5C17.5 16 21 16.2 21 12C21 7.8 18 8 18 8H16V10.5C16 10.5 16.1 13 13.5 13H9C9 13 7 12.9 7 15V19.5C7 19.5 6.7 22 12 22Z"
          fill="#eab308"
        />
        <circle cx="10" cy="4.5" r="0.9" fill="#fff" />
        <circle cx="14" cy="19.5" r="0.9" fill="#fff" />
      </svg>
    );
  }

  // 3. Go (.go, .mod, .sum) — Emblema Go Cyan
  if (e === 'go' || e === 'mod' || e === 'sum') {
    return (
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
        <rect x="2" y="4" width="20" height="16" rx="4" fill="#00add8" />
        <path
          d="M10.5 10.2C9.8 9.4 8.2 9.4 7.3 10.3C6.4 11.2 6.4 12.8 7.3 13.7C8.2 14.6 9.8 14.5 10.5 13.5H8.8V12H11.8V14.8C10.7 15.8 8.9 16.2 7.2 15.6C5.5 15 4.5 13.3 4.8 11.4C5 9.5 6.6 8 8.6 8C10 8 11.1 8.6 11.8 9.5L10.5 10.2Z"
          fill="#fff"
        />
        <circle cx="16.2" cy="12" r="3.2" stroke="#fff" strokeWidth="1.8" />
      </svg>
    );
  }

  // 4. TypeScript (.ts, .mts, .cts) — Emblema TS Oficial
  if (e === 'ts' || e === 'mts' || e === 'cts') {
    return (
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
        <rect x="2.5" y="2.5" width="19" height="19" rx="3.5" fill="#3178c6" />
        <path d="M6.5 10.5H12.5M9.5 10.5V17.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        <path
          d="M18 11.2C17.2 10.6 15.8 10.5 15 11.2C14.3 11.8 14.6 12.8 15.6 13.2L17 13.8C18.2 14.3 18.5 15.6 17.7 16.6C16.8 17.5 15 17.5 14 16.7"
          stroke="#fff"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // 5. JavaScript (.js, .mjs, .cjs) — Emblema JS Oficial
  if (e === 'js' || e === 'mjs' || e === 'cjs') {
    return (
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
        <rect x="2.5" y="2.5" width="19" height="19" rx="3.5" fill="#eab308" />
        <path
          d="M10.5 10.5V15.5C10.5 16.8 9.5 17.5 8.3 17.5C7.4 17.5 6.8 17 6.5 16.3"
          stroke="#18181b"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M17.8 11.2C17 10.6 15.7 10.5 15 11.2C14.3 11.8 14.6 12.8 15.6 13.2L16.9 13.8C18 14.3 18.3 15.6 17.5 16.6C16.7 17.5 15 17.5 14 16.7"
          stroke="#18181b"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // 6. HTML5 (.html, .htm) & CSS3 / Sass (.css, .scss, .sass, .less)
  if (e === 'html' || e === 'htm') {
    return (
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
        <path d="M4 3H20L18.5 19L12 21L5.5 19L4 3Z" fill="#e34f26" />
        <path d="M7.5 7.5H16.5L16 11.5H9.5L9.8 14.5L12 15.2L14.2 14.5L14.4 12.8" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (e === 'css' || e === 'scss' || e === 'sass' || e === 'less') {
    return (
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
        <path d="M4 3H20L18.5 19L12 21L5.5 19L4 3Z" fill={visual.color} />
        <path d="M8 7.5H16L15.3 15L12 16.2L8.7 15L8.5 13M8.5 11H15.6" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  // 7. Docker (Dockerfile, docker-compose)
  if (e === 'dockerfile') {
    return (
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
        <rect x="5" y="9" width="3" height="2.8" rx="0.4" fill="#2496ed" />
        <rect x="8.6" y="9" width="3" height="2.8" rx="0.4" fill="#2496ed" />
        <rect x="12.2" y="9" width="3" height="2.8" rx="0.4" fill="#2496ed" />
        <rect x="8.6" y="5.6" width="3" height="2.8" rx="0.4" fill="#2496ed" />
        <rect x="12.2" y="5.6" width="3" height="2.8" rx="0.4" fill="#2496ed" />
        <path
          d="M2.5 13C4 12.8 16.8 12.8 17.5 12.8C18.3 11.2 19.8 10.8 20.5 11.2C20.9 12.1 20.6 13.4 19.6 14C20.4 14.3 21.5 14.3 22 13.8C21.4 16.8 18.4 19.5 11.5 19.5C5.8 19.5 3 16.8 2.5 13Z"
          fill="#2496ed"
        />
      </svg>
    );
  }

  // 8. Git (.gitignore, .gitattributes, .diff, .patch)
  if (e === 'git' || e === 'diff' || e === 'patch') {
    return (
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
        <circle cx="7" cy="6" r="2.3" stroke="#f05032" strokeWidth="2" />
        <circle cx="7" cy="18" r="2.3" stroke="#f05032" strokeWidth="2" />
        <circle cx="17" cy="12" r="2.3" stroke="#f05032" strokeWidth="2" />
        <path d="M7 8.3V15.7M7 9.5C7 12 14.7 12 14.7 12" stroke="#f05032" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  // 9. Node.js / NPM (package.json, lockfiles)
  if (e === 'npm') {
    return (
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
        <path d="M12 2.5L20.5 7.4V16.6L12 21.5L3.5 16.6V7.4L12 2.5Z" fill="#22c55e" fillOpacity="0.22" stroke="#22c55e" strokeWidth="1.8" />
        <path d="M8.5 15V9.5L13.5 14.5V9.5" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  // 10. C / C++ / C# (.c, .cpp, .cc, .cxx, .h, .hpp, .cs, .csproj, .sln)
  if (
    e === 'c' ||
    e === 'cpp' ||
    e === 'cc' ||
    e === 'cxx' ||
    e === 'h' ||
    e === 'hpp' ||
    e === 'cs' ||
    e === 'csproj' ||
    e === 'sln'
  ) {
    return (
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
        <path
          d="M12 2L20.5 7V17L12 22L3.5 17V7L12 2Z"
          fill={visual.color}
          fillOpacity="0.2"
          stroke={visual.color}
          strokeWidth="1.8"
        />
        <path
          d="M14.2 9.2C13.3 8.3 11.9 8 10.6 8.5C9.3 9 8.5 10.3 8.5 12C8.5 13.7 9.3 15 10.6 15.5C11.9 16 13.3 15.7 14.2 14.8"
          stroke={visual.color}
          strokeWidth="2.1"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // 11. Vue / Svelte / GraphQL / Prisma / Terraform
  if (e === 'vue') {
    return (
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
        <path d="M2.5 4.5H7.2L12 13L16.8 4.5H21.5L12 20.5L2.5 4.5Z" fill="#10b981" />
        <path d="M7.2 4.5H10.2L12 7.8L13.8 4.5H16.8L12 13L7.2 4.5Z" fill="#334155" />
      </svg>
    );
  }
  if (e === 'prisma') {
    return (
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
        <path
          d="M12.5 2.5L4.5 15.8L10.5 21.5L20 18.2L12.5 2.5Z"
          stroke="#14b8a6"
          strokeWidth="1.9"
          strokeLinejoin="round"
        />
        <path d="M12.5 2.5L10.5 21.5" stroke="#14b8a6" strokeWidth="1.6" />
      </svg>
    );
  }
  if (e === 'graphql' || e === 'gql') {
    return (
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
        <polygon
          points="12,3 19.8,7.5 19.8,16.5 12,21 4.2,16.5 4.2,7.5"
          stroke="#e10098"
          strokeWidth="1.6"
        />
        <polygon points="12,3 19.8,16.5 4.2,16.5" stroke="#e10098" strokeWidth="1.4" />
        <circle cx="12" cy="3" r="1.6" fill="#e10098" />
        <circle cx="19.8" cy="7.5" r="1.6" fill="#e10098" />
        <circle cx="19.8" cy="16.5" r="1.6" fill="#e10098" />
        <circle cx="12" cy="21" r="1.6" fill="#e10098" />
        <circle cx="4.2" cy="16.5" r="1.6" fill="#e10098" />
        <circle cx="4.2" cy="7.5" r="1.6" fill="#e10098" />
      </svg>
    );
  }

  // 12. Bancos de Dados Relacionais, Analíticos e NoSQL (.db, .sqlite, .sqlite3, .duckdb, .mdf, .mdb, .rdb, .bson, .dump)
  if (visual.category === 'database') {
    return (
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
        <ellipse
          cx="12"
          cy="5.5"
          rx="7.5"
          ry="2.8"
          fill={visual.color}
          fillOpacity="0.28"
          stroke={visual.color}
          strokeWidth="1.8"
        />
        <path
          d="M4.5 5.5V12C4.5 13.5 7.8 14.8 12 14.8C16.2 14.8 19.5 13.5 19.5 12V5.5"
          stroke={visual.color}
          strokeWidth="1.8"
        />
        <path
          d="M4.5 12V18.5C4.5 20 7.8 21.3 12 21.3C16.2 21.3 19.5 20 19.5 18.5V12"
          stroke={visual.color}
          strokeWidth="1.8"
        />
        <circle cx="8.2" cy="10.2" r="1" fill={visual.color} />
        <circle cx="8.2" cy="16.7" r="1" fill={visual.color} />
      </svg>
    );
  }

  // 13. Scripts SQL (.sql, .psql, .plsql, .tsql, .cql)
  if (visual.category === 'sql') {
    return (
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
        <ellipse
          cx="10.5"
          cy="5.5"
          rx="6.5"
          ry="2.5"
          fill={visual.color}
          fillOpacity="0.22"
          stroke={visual.color}
          strokeWidth="1.7"
        />
        <path
          d="M4 5.5V16.5C4 18 6.9 19.2 10.5 19.2C11.8 19.2 13 19 14 18.7"
          stroke={visual.color}
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <path d="M17 5.5V11" stroke={visual.color} strokeWidth="1.7" strokeLinecap="round" />
        <path
          d="M16 13.5L13.5 16L16 18.5M19.5 13.5L22 16L19.5 18.5"
          stroke={visual.color}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return null;
}

function renderGlyphForVisual(visual: FileTypeVisual, lowerName: string, iconSize: number) {
  const style: React.CSSProperties = { color: visual.color, flexShrink: 0 };

  if (visual.category === 'folder') {
    if (visual.ext === 'dir-git' || lowerName === '.git' || lowerName === '.github') {
      return <FolderGit2 size={iconSize} style={style} />;
    }
    if (visual.ext === 'dir-db') {
      return <Database size={iconSize} style={style} />;
    }
    if (visual.ext === 'dir-src' || lowerName === 'src' || lowerName === 'app' || lowerName === 'internal') {
      return <FolderCode size={iconSize} style={style} />;
    }
    if (visual.ext === 'dir-deps' || visual.ext === 'dir-build' || lowerName === 'node_modules' || lowerName === 'build' || lowerName === 'dist') {
      return <FolderCog size={iconSize} style={style} />;
    }
    return <Folder size={iconSize} style={style} />;
  }

  const customDevOrDb = renderSpecializedDevOrDbSvg(visual, iconSize);
  if (customDevOrDb) {
    return customDevOrDb;
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
    visual.badge.length <= 6;

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

