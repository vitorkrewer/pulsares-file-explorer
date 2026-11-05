import React from 'react';
import { useTranslation } from 'react-i18next';
import { useBrowserStore } from './store';

export const StatusBar: React.FC = () => {
  const { t } = useTranslation('common');
  const { entries, selectedPaths, showHidden } = useBrowserStore();

  const visibleEntries = showHidden ? entries : entries.filter((e) => !e.attrs.hidden);
  const totalCount = visibleEntries.length;
  const selectedCount = selectedPaths.size;

  return (
    <div style={styles.statusBar}>
      <div style={styles.section}>
        <span>
          {totalCount === 1
            ? t('status.items', { count: totalCount })
            : t('status.items_plural', { count: totalCount })}
        </span>
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
  divider: {
    color: 'var(--border-strong)',
  },
};

