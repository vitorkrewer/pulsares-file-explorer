import React from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { useBrowserStore } from './store';
import { useFolderTreeStore } from '../sidebar/folder-tree/store';
import { formatBytes } from '../../i18n/format';

export const StatusBar: React.FC = () => {
  const { t, i18n } = useTranslation('common');
  const { entries, selectedPaths, showHidden, currentPath, isLoading } = useBrowserStore();
  const { drives } = useFolderTreeStore();

  const visibleEntries = showHidden ? entries : entries.filter((e) => !e.attrs.hidden);
  const totalCount = visibleEntries.length;
  const selectedCount = selectedPaths.size;

  const activeDrive = drives.find((d) =>
    currentPath.toLowerCase().startsWith(d.path.toLowerCase())
  );

  return (
    <div style={styles.statusBar}>
      <div style={styles.section}>
        {isLoading ? (
          <span style={styles.loadingBadge}>
            <Loader2 size={12} className="spin-animation" style={{ color: 'var(--accent)' }} />
            <span>{t('status.loading')}</span>
          </span>
        ) : (
          <span>
            {totalCount === 1
              ? t('status.items', { count: totalCount })
              : t('status.items_plural', { count: totalCount })}
          </span>
        )}
        {selectedCount > 0 && (
          <>
            <span style={styles.divider}>•</span>
            <span>
              {selectedCount === 1
                ? t('status.selected', { count: selectedCount })
                : t('status.selected_plural', { count: selectedCount })}
            </span>
          </>
        )}
      </div>

      {activeDrive && activeDrive.freeBytes !== undefined && activeDrive.freeBytes > 0 && (
        <div style={styles.section}>
          <span>
            {t('status.freeSpace', {
              free: formatBytes(activeDrive.freeBytes, i18n.language),
            })}
          </span>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  statusBar: {
    height: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px',
    backgroundColor: 'var(--bg-app)',
    borderTop: '1px solid var(--border-subtle)',
    fontSize: 11,
    color: 'var(--text-secondary)',
    userSelect: 'none',
  },
  section: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  loadingBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    color: 'var(--accent)',
    fontWeight: 500,
  },
  divider: {
    color: 'var(--border-strong)',
  },
};
