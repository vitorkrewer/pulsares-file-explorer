import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, X, Lock, HardDrive, Loader2, AlertCircle, Info } from 'lucide-react';
import { useFolderTreeStore } from './folder-tree/store';
import { useBrowserStore } from '../browser/store';
import { connectNetworkDrive } from '../../lib/wails';
import { SoftSelect } from '../../ui/SoftSelect';

type NetworkProtocolChoice = 'auto' | 'smb' | 'nfs' | 'afp';

function detectProtocolFromInput(raw: string): 'smb' | 'nfs' | 'afp' | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^afp:\/\//i.test(trimmed)) return 'afp';
  if (/^nfs:\/\//i.test(trimmed)) return 'nfs';
  if (/^(smb|cifs):\/\//i.test(trimmed) || /^(\\\\|\/\/)/.test(trimmed)) return 'smb';
  if (!trimmed.includes('://') && /^[^/\\:\s]{2,}:(\/|$)/.test(trimmed.replace(/\\/g, '/'))) {
    return 'nfs';
  }
  return null;
}

export const NetworkDriveModal: React.FC = () => {
  const { t } = useTranslation('common');
  const {
    networkModalOpen,
    networkModalPrefill,
    availableDriveLetters,
    closeNetworkModal,
    refreshSidebarMeta,
  } = useFolderTreeStore();
  const { navigateTo } = useBrowserStore();

  const [protocol, setProtocol] = useState<NetworkProtocolChoice>('auto');
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const [useCustomAuth, setUseCustomAuth] = useState(false);
  const [username, setUsername] = useState('');
  const [domain, setDomain] = useState('');
  const [password, setPassword] = useState('');
  const [driveLetter, setDriveLetter] = useState('');
  const [persistent, setPersistent] = useState(false);
  const [saveShortcut, setSaveShortcut] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addressInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!networkModalOpen) return;

    const prefillProto = (networkModalPrefill?.protocol || '').toLowerCase();
    const prefillAddr = networkModalPrefill?.address || '';
    const prefillLabel = networkModalPrefill?.label || '';
    const prefillUser = networkModalPrefill?.username || '';
    const prefillDomain = networkModalPrefill?.domain || '';
    const prefillLetter = networkModalPrefill?.driveLetter || '';

    if (prefillProto === 'smb' || prefillProto === 'nfs' || prefillProto === 'afp') {
      setProtocol(prefillProto);
    } else {
      setProtocol('auto');
    }
    setAddress(prefillAddr);
    setLabel(prefillLabel);
    setUsername(prefillUser);
    setDomain(prefillDomain);
    setPassword('');
    setUseCustomAuth(Boolean(prefillUser || (prefillAddr && prefillProto !== 'nfs')));
    setDriveLetter(
      prefillLetter && availableDriveLetters.includes(prefillLetter) ? prefillLetter : ''
    );
    setPersistent(false);
    setSaveShortcut(true);
    setConnecting(false);
    setError(null);

    const timer = setTimeout(() => {
      if (prefillAddr && prefillUser && passwordInputRef.current) {
        passwordInputRef.current.focus();
      } else {
        addressInputRef.current?.focus();
      }
    }, 40);
    return () => clearTimeout(timer);
  }, [networkModalOpen, networkModalPrefill, availableDriveLetters]);

  useEffect(() => {
    if (!networkModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !connecting) {
        e.stopPropagation();
        closeNetworkModal();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [networkModalOpen, connecting, closeNetworkModal]);

  if (!networkModalOpen) return null;

  const detectedProto = detectProtocolFromInput(address);
  const effectiveProtocol: 'smb' | 'nfs' | 'afp' =
    protocol === 'auto' ? detectedProto || 'smb' : protocol;
  const isWindowsHost = availableDriveLetters.length > 0;
  const canMapDriveLetter = isWindowsHost && effectiveProtocol !== 'afp';

  const addressPlaceholder =
    effectiveProtocol === 'nfs'
      ? t('networkDrive.addressPlaceholderNFS')
      : effectiveProtocol === 'afp'
        ? t('networkDrive.addressPlaceholderAFP')
        : t('networkDrive.addressPlaceholder');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedAddr = address.trim();
    if (!trimmedAddr) {
      setError(t('networkDrive.addressRequired'));
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      const res = await connectNetworkDrive(
        {
          protocol: protocol === 'auto' ? '' : protocol,
          address: trimmedAddr,
          label: label.trim(),
          username: useCustomAuth ? username.trim() : '',
          domain: useCustomAuth && effectiveProtocol === 'smb' ? domain.trim() : '',
          password: useCustomAuth ? password : '',
          driveLetter: canMapDriveLetter ? driveLetter : '',
          persistent: Boolean(canMapDriveLetter && driveLetter && persistent),
        },
        saveShortcut
      );

      await refreshSidebarMeta();
      closeNetworkModal();
      if (res?.connectedPath) {
        navigateTo(res.connectedPath);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || t('networkDrive.connectError'));
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div
      style={styles.backdrop}
      onClick={() => {
        if (!connecting) closeNetworkModal();
      }}
    >
      <div
        style={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={t('networkDrive.connectTitle')}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.header}>
          <div style={styles.headerTitleRow}>
            <Globe size={16} style={{ color: 'var(--accent)' }} />
            <span style={styles.headerTitle}>{t('networkDrive.connectTitle')}</span>
          </div>
          <button
            type="button"
            style={styles.closeBtn}
            onClick={closeNetworkModal}
            disabled={connecting}
            title={t('networkDrive.cancel')}
          >
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={styles.body}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>{t('networkDrive.protocolLabel')}</label>
            <div style={styles.protoRow} role="radiogroup" aria-label={t('networkDrive.protocolLabel')}>
              {(
                [
                  { id: 'auto', label: t('networkDrive.protocolAuto') },
                  { id: 'smb', label: t('networkDrive.protocolSMB') },
                  { id: 'nfs', label: t('networkDrive.protocolNFS') },
                  { id: 'afp', label: t('networkDrive.protocolAFP') },
                ] as { id: NetworkProtocolChoice; label: string }[]
              ).map((opt) => {
                const active = protocol === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={connecting}
                    onClick={() => setProtocol(opt.id)}
                    style={{
                      ...styles.protoPill,
                      ...(active ? styles.protoPillActive : {}),
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={styles.fieldGroup}>
            <label style={styles.label}>{t('networkDrive.addressLabel')}</label>
            <input
              ref={addressInputRef}
              type="text"
              style={styles.input}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={addressPlaceholder}
              disabled={connecting}
              autoComplete="off"
              spellCheck={false}
            />
            <span style={styles.hint}>{t('networkDrive.addressHint')}</span>
          </div>

          {isWindowsHost && effectiveProtocol === 'afp' && (
            <div style={styles.infoBanner}>
              <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{t('networkDrive.afpPlatformHint')}</span>
            </div>
          )}

          <div style={styles.fieldGroup}>
            <label style={styles.label}>{t('networkDrive.aliasLabel')}</label>
            <input
              type="text"
              style={styles.input}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t('networkDrive.aliasPlaceholder')}
              disabled={connecting}
            />
          </div>

          {canMapDriveLetter && (
            <div style={styles.rowGrid}>
              <div style={{ ...styles.fieldGroup, flex: 1 }}>
                <label style={styles.label}>
                  <HardDrive size={12} style={{ marginRight: 5, verticalAlign: 'middle' }} />
                  {t('networkDrive.driveLetterLabel')}
                </label>
                <SoftSelect
                  size="md"
                  fullWidth
                  value={driveLetter}
                  onChange={setDriveLetter}
                  disabled={connecting}
                  ariaLabel={t('networkDrive.driveLetterLabel')}
                  options={[
                    { value: '', label: t('networkDrive.noDriveLetter') },
                    ...availableDriveLetters.map((letter) => ({
                      value: letter,
                      label: `${letter}\\`,
                    })),
                  ]}
                />
              </div>
              {driveLetter && (
                <label style={{ ...styles.checkboxRow, alignSelf: 'flex-end', paddingBottom: 8 }}>
                  <input
                    type="checkbox"
                    checked={persistent}
                    onChange={(e) => setPersistent(e.target.checked)}
                    disabled={connecting}
                  />
                  <span>{t('networkDrive.persistentLabel')}</span>
                </label>
              )}
            </div>
          )}

          <div style={styles.authBox}>
            <label style={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={useCustomAuth}
                onChange={(e) => setUseCustomAuth(e.target.checked)}
                disabled={connecting}
              />
              <Lock size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <span style={{ fontWeight: 600 }}>{t('networkDrive.useCredentials')}</span>
            </label>

            {effectiveProtocol === 'nfs' && !useCustomAuth && (
              <span style={styles.hint}>{t('networkDrive.nfsAuthHint')}</span>
            )}

            {useCustomAuth && (
              <div style={styles.authFields}>
                <div style={styles.rowGrid}>
                  <div style={{ ...styles.fieldGroup, flex: 1 }}>
                    <label style={styles.label}>{t('networkDrive.usernameLabel')}</label>
                    <input
                      type="text"
                      style={styles.input}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder={t('networkDrive.usernamePlaceholder')}
                      disabled={connecting}
                      autoComplete="off"
                    />
                  </div>
                  {effectiveProtocol === 'smb' && (
                    <div style={{ ...styles.fieldGroup, width: 155 }}>
                      <label style={styles.label}>{t('networkDrive.domainLabel')}</label>
                      <input
                        type="text"
                        style={styles.input}
                        value={domain}
                        onChange={(e) => setDomain(e.target.value)}
                        placeholder="WORKGROUP"
                        disabled={connecting}
                        autoComplete="off"
                      />
                    </div>
                  )}
                </div>
                <div style={styles.fieldGroup}>
                  <label style={styles.label}>{t('networkDrive.passwordLabel')}</label>
                  <input
                    ref={passwordInputRef}
                    type="password"
                    style={styles.input}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    disabled={connecting}
                  />
                  <span style={styles.hint}>{t('networkDrive.securityNote')}</span>
                </div>
              </div>
            )}
          </div>

          <label style={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={saveShortcut}
              onChange={(e) => setSaveShortcut(e.target.checked)}
              disabled={connecting}
            />
            <span>{t('networkDrive.saveShortcut')}</span>
          </label>

          {error && (
            <div style={styles.errorBanner}>
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{error}</span>
            </div>
          )}

          <div style={styles.footer}>
            <button
              type="button"
              style={styles.secondaryBtn}
              onClick={closeNetworkModal}
              disabled={connecting}
            >
              {t('networkDrive.cancel')}
            </button>
            <button type="submit" style={styles.primaryBtn} disabled={connecting}>
              {connecting ? (
                <>
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  <span>{t('networkDrive.connecting')}</span>
                </>
              ) : (
                <span>{t('networkDrive.connectAction')}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1200,
    padding: 16,
  },
  modal: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 10,
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.45)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--bg-base)',
  },
  headerTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  closeBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 26,
    height: 26,
    borderRadius: 6,
    border: 'none',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'default',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 16,
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  rowGrid: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
  },
  protoRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: 6,
  },
  protoPill: {
    padding: '6px 8px',
    fontSize: 11.5,
    fontWeight: 600,
    borderRadius: 6,
    border: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--bg-base)',
    color: 'var(--text-secondary)',
    cursor: 'default',
    textAlign: 'center',
  },
  protoPillActive: {
    borderColor: 'var(--accent)',
    backgroundColor: 'rgba(59, 130, 246, 0.14)',
    color: 'var(--accent)',
  },
  infoBanner: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '8px 10px',
    borderRadius: 6,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    border: '1px solid rgba(59, 130, 246, 0.3)',
    color: 'var(--text-secondary)',
    fontSize: 11.5,
    lineHeight: 1.4,
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-secondary)',
  },
  input: {
    width: '100%',
    padding: '7px 10px',
    fontSize: 12,
    borderRadius: 6,
    border: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--bg-base)',
    color: 'var(--text-primary)',
    boxSizing: 'border-box',
    outline: 'none',
  },
  hint: {
    fontSize: 10.5,
    color: 'var(--text-muted)',
    lineHeight: 1.35,
  },
  authBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--bg-base)',
  },
  authFields: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    paddingTop: 4,
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    fontSize: 12,
    color: 'var(--text-primary)',
    cursor: 'default',
    userSelect: 'none',
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '8px 10px',
    borderRadius: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    border: '1px solid rgba(239, 68, 68, 0.35)',
    color: '#ef4444',
    fontSize: 11.5,
    lineHeight: 1.4,
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    paddingTop: 6,
  },
  secondaryBtn: {
    padding: '7px 14px',
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 6,
    border: '1px solid var(--border-subtle)',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'default',
  },
  primaryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 16px',
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 6,
    border: 'none',
    backgroundColor: 'var(--accent)',
    color: '#ffffff',
    cursor: 'default',
  },
};

