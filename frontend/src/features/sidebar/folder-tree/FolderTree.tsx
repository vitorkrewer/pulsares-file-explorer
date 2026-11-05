import React, { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  HardDrive,
  Link2,
  Loader2,
} from 'lucide-react';
import { useFolderTreeStore, buildFlatTree, FlatTreeNode } from './store';
import { useBrowserStore } from '../../browser/store';

export const FolderTree: React.FC = () => {
  const { t, i18n } = useTranslation('common');
  const {
    roots,
    nodesByPath,
    focusedPath,
    setFocusedPath,
    toggleExpand,
    expandLevel,
    revealPath,
    loadRoots,
  } = useFolderTreeStore();
  const { currentPath, showHidden, navigateTo, newTab } = useBrowserStore();

  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (roots.length === 0) {
      loadRoots();
    }
  }, [roots.length, loadRoots]);

  useEffect(() => {
    if (currentPath) {
      revealPath(currentPath, showHidden, i18n.language);
    }
  }, [currentPath, showHidden, i18n.language, revealPath]);

  const flatNodes = useMemo(
    () => buildFlatTree(roots, nodesByPath),
    [roots, nodesByPath]
  );

  const rowVirtualizer = useVirtualizer({
    count: flatNodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 26,
    overscan: 12,
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (flatNodes.length === 0) return;

    const currentIndex = flatNodes.findIndex(
      (item) => item.node.location.path === (focusedPath || currentPath)
    );
    const activeIdx = currentIndex >= 0 ? currentIndex : 0;
    const currentItem = flatNodes[activeIdx];
    if (!currentItem) return;

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        const nextIdx = Math.min(flatNodes.length - 1, activeIdx + 1);
        const nextPath = flatNodes[nextIdx].node.location.path;
        setFocusedPath(nextPath);
        rowVirtualizer.scrollToIndex(nextIdx);
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        const prevIdx = Math.max(0, activeIdx - 1);
        const prevPath = flatNodes[prevIdx].node.location.path;
        setFocusedPath(prevPath);
        rowVirtualizer.scrollToIndex(prevIdx);
        break;
      }
      case 'ArrowRight': {
        e.preventDefault();
        if (currentItem.node.hasChildren !== 'no') {
          if (!currentItem.expanded) {
            toggleExpand(currentItem.node, showHidden, i18n.language);
          } else if (activeIdx + 1 < flatNodes.length) {
            const nextItem = flatNodes[activeIdx + 1];
            if (nextItem.parentPath === currentItem.node.location.path) {
              setFocusedPath(nextItem.node.location.path);
              rowVirtualizer.scrollToIndex(activeIdx + 1);
            }
          }
        }
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        if (currentItem.expanded) {
          toggleExpand(currentItem.node, showHidden, i18n.language);
        } else if (currentItem.parentPath) {
          const parentIdx = flatNodes.findIndex(
            (item) => item.node.location.path === currentItem.parentPath
          );
          if (parentIdx >= 0) {
            setFocusedPath(currentItem.parentPath);
            rowVirtualizer.scrollToIndex(parentIdx);
          }
        }
        break;
      }
      case 'Enter': {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          newTab(currentItem.node.location.path);
        } else {
          navigateTo(currentItem.node.location.path);
        }
        break;
      }
      case '*': {
        e.preventDefault();
        expandLevel(currentItem.node, showHidden, i18n.language);
        break;
      }
      case 'F5': {
        e.preventDefault();
        loadRoots();
        break;
      }
    }
  };

  const renderNodeIcon = (item: FlatTreeNode) => {
    if (item.depth === 1 && /^[a-zA-Z]:\\?$/.test(item.node.location.path)) {
      return <HardDrive size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />;
    }
    if (item.node.isLink) {
      return <Link2 size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />;
    }
    if (item.expanded) {
      return <FolderOpen size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />;
    }
    return <Folder size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />;
  };

  return (
    <div
      ref={parentRef}
      role="tree"
      aria-label={t('tree.title')}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={styles.treeContainer}
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const item = flatNodes[virtualRow.index];
          const path = item.node.location.path;
          const isCurrent = path === currentPath;
          const isFocused = path === focusedPath;
          const showChevron = item.node.hasChildren !== 'no';

          return (
            <div
              key={path}
              role="treeitem"
              aria-level={item.depth}
              aria-expanded={showChevron ? item.expanded : undefined}
              aria-selected={isCurrent}
              title={item.node.isLink ? `${path} (${t('tree.symlink')})` : path}
              onClick={() => {
                setFocusedPath(path);
                navigateTo(path);
              }}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  newTab(path);
                }
              }}
              style={{
                ...styles.treeRow,
                ...(isCurrent ? styles.activeRow : {}),
                ...(isFocused && !isCurrent ? styles.focusedRow : {}),
                paddingLeft: `${(item.depth - 1) * 14 + 6}px`,
                transform: `translateY(${virtualRow.start}px)`,
                height: `${virtualRow.size}px`,
              }}
            >
              <span
                style={styles.chevronBox}
                onClick={(e) => {
                  e.stopPropagation();
                  if (showChevron) {
                    toggleExpand(item.node, showHidden, i18n.language);
                  }
                }}
              >
                {item.loading ? (
                  <Loader2 size={12} />
                ) : showChevron ? (
                  item.expanded ? (
                    <ChevronDown size={13} />
                  ) : (
                    <ChevronRight size={13} />
                  )
                ) : null}
              </span>
              {renderNodeIcon(item)}
              <span style={styles.nodeLabel}>{item.node.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  treeContainer: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
    outline: 'none',
    userSelect: 'none',
    padding: '4px 0',
  },
  treeRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    paddingRight: 8,
    fontSize: 12,
    color: 'var(--text-primary)',
    cursor: 'pointer',
    boxSizing: 'border-box',
  },
  activeRow: {
    backgroundColor: 'var(--bg-selected, rgba(59, 130, 246, 0.18))',
    fontWeight: 500,
  },
  focusedRow: {
    outline: '1px solid var(--accent)',
    outlineOffset: -1,
  },
  chevronBox: {
    width: 16,
    height: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-secondary)',
    flexShrink: 0,
  },
  nodeLabel: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
  },
};

