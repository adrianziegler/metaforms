'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';

interface MetaConnection {
    connected: boolean;
    page_name?: string;
    pixel_id?: string;
    connected_at?: string;
}

export default function SettingsPage() {
    const [connection, setConnection] = useState<MetaConnection>({ connected: false });
    const [loading, setLoading] = useState(true);
    const [webhookUrl, setWebhookUrl] = useState('');
    const [activeTab, setActiveTab] = useState<'general' | 'branding' | 'meta-guide'>('general');
    const [notifyNewLead, setNotifyNewLead] = useState(true);
    const [emailLogs, setEmailLogs] = useState<Array<{
        id: string;
        recipient: string;
        subject: string;
        success: boolean;
        error_message: string | null;
        created_at: string;
    }>>([]);
    const [showEmailLogs, setShowEmailLogs] = useState(false);
    const [emailLogsLoading, setEmailLogsLoading] = useState(false);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setWebhookUrl(`${window.location.origin}/api/webhooks/meta`);
        }
        fetchConnection();
        fetchNotificationSettings();
    }, []);

    const fetchNotificationSettings = async () => {
        try {
            const res = await fetch('/api/settings/notifications');
            if (res.ok) {
                const data = await res.json();
                setNotifyNewLead(data.notifyNewLead ?? true);
            }
        } catch (error) {
            console.error('Error fetching notification settings:', error);
        }
    };

    const fetchEmailLogs = async () => {
        setEmailLogsLoading(true);
        try {
            const res = await fetch('/api/settings/email-logs?limit=20');
            if (res.ok) {
                const data = await res.json();
                setEmailLogs(data.logs || []);
            }
        } catch (error) {
            console.error('Error fetching email logs:', error);
        } finally {
            setEmailLogsLoading(false);
        }
    };

    const handleToggleEmailLogs = () => {
        const newShow = !showEmailLogs;
        setShowEmailLogs(newShow);
        if (newShow && emailLogs.length === 0) {
            fetchEmailLogs();
        }
    };

    const handleToggleNotifyNewLead = async () => {
        const newValue = !notifyNewLead;
        setNotifyNewLead(newValue);
        try {
            const res = await fetch('/api/settings/notifications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notifyNewLead: newValue }),
            });
            if (res.ok) {
                toast.success(newValue ? 'Admin-Benachrichtigungen aktiviert' : 'Admin-Benachrichtigungen deaktiviert');
            } else {
                setNotifyNewLead(!newValue); // Revert on error
                toast.error('Fehler beim Speichern');
            }
        } catch {
            setNotifyNewLead(!newValue);
            toast.error('Fehler beim Speichern');
        }
    };

    const fetchConnection = async () => {
        try {
            const res = await fetch('/api/meta/status');
            const data = await res.json();
            setConnection(data);
        } catch (error) {
            console.error('Error fetching connection:', error);
        }
        setLoading(false);
    };

    const handleConnectMeta = () => {
        const appId = process.env.NEXT_PUBLIC_META_APP_ID || '';
        if (!appId) {
            alert('Meta App ID ist nicht konfiguriert. Bitte in Coolify Umgebungsvariablen setzen.');
            return;
        }

        const redirectUri = encodeURIComponent(`${window.location.origin}/api/auth/meta/callback`);
        const scope = encodeURIComponent('business_management,leads_retrieval,pages_show_list,pages_read_engagement,pages_manage_metadata,ads_management,ads_read');

        window.location.href = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code`;
    };

    const handleDisconnect = async () => {
        if (!confirm('Meta Verbindung wirklich trennen?')) return;

        try {
            await fetch('/api/meta/disconnect', { method: 'POST' });
            setConnection({ connected: false });
        } catch (error) {
            console.error('Error disconnecting:', error);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Einstellungen</h1>
                <p className="text-gray-500 text-sm mt-1">Meta-Verbindung und Benachrichtigungen konfigurieren</p>
            </div>

            {/* Tabs */}
            <div className="bg-white rounded-xl border border-gray-200 p-1 inline-flex">
                <button
                    onClick={() => setActiveTab('general')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        activeTab === 'general'
                            ? 'bg-[#0052FF] text-white'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    Allgemein
                </button>
                <button
                    onClick={() => setActiveTab('branding')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                        activeTab === 'branding'
                            ? 'bg-[#0052FF] text-white'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                    </svg>
                    Branding
                </button>
                <button
                    onClick={() => setActiveTab('meta-guide')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                        activeTab === 'meta-guide'
                            ? 'bg-[#0052FF] text-white'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Meta Setup Guide
                </button>
            </div>

            {activeTab === 'general' ? (
                <>
                    {/* Meta Connection Card */}
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <div className="p-6">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 2.04c-5.5 0-10 4.49-10 10.02 0 5 3.66 9.15 8.44 9.9v-7H7.9v-2.9h2.54V9.85c0-2.51 1.49-3.89 3.78-3.89 1.09 0 2.23.19 2.23.19v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.9h-2.33v7a10 10 0 0 0 8.44-9.9c0-5.53-4.5-10.02-10-10.02z" />
                                    </svg>
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-semibold text-gray-900">Meta Business Account</h3>
                                    {loading ? (
                                        <p className="text-sm text-gray-500">Ladt...</p>
                                    ) : connection.connected ? (
                                        <p className="text-sm text-gray-500">{connection.page_name || 'Verbunden'}</p>
                                    ) : (
                                        <p className="text-sm text-gray-500">Nicht verbunden</p>
                                    )}
                                </div>
                                {!loading && (
                                    connection.connected ? (
                                        <span className="px-3 py-1.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                                            Aktiv
                                        </span>
                                    ) : (
                                        <span className="px-3 py-1.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                                            Setup erforderlich
                                        </span>
                                    )
                                )}
                            </div>
                        </div>

                        {!loading && (
                            <div className="px-6 pb-6">
                                {connection.connected ? (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-xl">
                                            <div>
                                                <span className="text-xs text-gray-500 uppercase tracking-wide">Pixel ID</span>
                                                <p className="font-mono text-sm text-gray-900 mt-1">{connection.pixel_id || 'Automatisch'}</p>
                                            </div>
                                            <div>
                                                <span className="text-xs text-gray-500 uppercase tracking-wide">Verbunden seit</span>
                                                <p className="text-sm text-gray-900 mt-1">
                                                    {connection.connected_at ? new Date(connection.connected_at).toLocaleDateString('de-DE') : '-'}
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={handleDisconnect}
                                            className="px-4 py-2.5 rounded-lg border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                                        >
                                            Verbindung trennen
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <p className="text-sm text-gray-600">
                                            Verbinde dein Meta Business Account um Lead Forms zu empfangen und Qualitatssignale zu senden.
                                        </p>
                                        <button
                                            onClick={handleConnectMeta}
                                            className="px-6 py-2.5 rounded-lg bg-[#0052FF] text-white text-sm font-medium hover:bg-[#0047E1] transition-colors flex items-center gap-2"
                                        >
                                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M12 2.04c-5.5 0-10 4.49-10 10.02 0 5 3.66 9.15 8.44 9.9v-7H7.9v-2.9h2.54V9.85c0-2.51 1.49-3.89 3.78-3.89 1.09 0 2.23.19 2.23.19v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.9h-2.33v7a10 10 0 0 0 8.44-9.9c0-5.53-4.5-10.02-10-10.02z" />
                                            </svg>
                                            Mit Meta verbinden
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Notifications Section */}
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <div className="p-6 border-b border-gray-100">
                            <h3 className="font-semibold text-gray-900">Benachrichtigungen</h3>
                            <p className="text-sm text-gray-500 mt-1">Wie mochtest du uber neue Leads informiert werden?</p>
                        </div>

                        <div className="divide-y divide-gray-100">
                            {/* Browser Push */}
                            <div className="flex items-center justify-between p-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                                        <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-gray-900">Browser Push</h4>
                                        <p className="text-sm text-gray-500">Sofort-Benachrichtigung bei neuem Lead</p>
                                    </div>
                                </div>
                                <PushNotificationToggle />
                            </div>

                            {/* Email bei neuem Lead (Admin) */}
                            <div className="flex items-center justify-between p-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                                        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-gray-900">E-Mail bei neuem Lead</h4>
                                        <p className="text-sm text-gray-500">Admin wird per E-Mail informiert wenn Lead eingeht</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={handleToggleEmailLogs}
                                        className="text-sm text-[#0052FF] font-medium hover:underline"
                                    >
                                        {showEmailLogs ? 'Log ausblenden' : 'Log anzeigen'}
                                    </button>
                                    <button
                                        onClick={handleToggleNotifyNewLead}
                                        className={`relative w-11 h-6 rounded-full transition-colors ${notifyNewLead ? 'bg-[#0052FF]' : 'bg-gray-300'}`}
                                    >
                                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${notifyNewLead ? 'translate-x-5' : ''}`} />
                                    </button>
                                </div>
                            </div>

                            {/* Email Log Section */}
                            {showEmailLogs && (
                                <div className="px-6 pb-6 -mt-2">
                                    <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                                        <div className="px-4 py-3 bg-gray-100 border-b border-gray-200 flex items-center justify-between">
                                            <span className="text-sm font-medium text-gray-700">Gesendete Admin-Benachrichtigungen</span>
                                            <button
                                                onClick={fetchEmailLogs}
                                                disabled={emailLogsLoading}
                                                className="text-xs text-[#0052FF] hover:underline disabled:opacity-50"
                                            >
                                                {emailLogsLoading ? 'Laden...' : 'Aktualisieren'}
                                            </button>
                                        </div>
                                        {emailLogsLoading && emailLogs.length === 0 ? (
                                            <div className="p-4 text-center text-sm text-gray-500">
                                                Lade Logs...
                                            </div>
                                        ) : emailLogs.length === 0 ? (
                                            <div className="p-4 text-center text-sm text-gray-500">
                                                Noch keine Emails versendet
                                            </div>
                                        ) : (
                                            <div className="max-h-64 overflow-y-auto">
                                                <table className="w-full text-sm">
                                                    <thead className="bg-gray-50 sticky top-0">
                                                        <tr>
                                                            <th className="text-left px-4 py-2 text-gray-600 font-medium">Zeitpunkt</th>
                                                            <th className="text-left px-4 py-2 text-gray-600 font-medium">Empfanger</th>
                                                            <th className="text-left px-4 py-2 text-gray-600 font-medium">Betreff</th>
                                                            <th className="text-left px-4 py-2 text-gray-600 font-medium">Status</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-200">
                                                        {emailLogs.map((log) => (
                                                            <tr key={log.id} className="hover:bg-gray-50">
                                                                <td className="px-4 py-2 text-gray-600 whitespace-nowrap">
                                                                    {new Date(log.created_at).toLocaleString('de-DE', {
                                                                        day: '2-digit',
                                                                        month: '2-digit',
                                                                        year: '2-digit',
                                                                        hour: '2-digit',
                                                                        minute: '2-digit'
                                                                    })}
                                                                </td>
                                                                <td className="px-4 py-2 text-gray-900">{log.recipient}</td>
                                                                <td className="px-4 py-2 text-gray-600 max-w-[200px] truncate" title={log.subject}>
                                                                    {log.subject}
                                                                </td>
                                                                <td className="px-4 py-2">
                                                                    {log.success ? (
                                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                                            Gesendet
                                                                        </span>
                                                                    ) : (
                                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800" title={log.error_message || 'Fehler'}>
                                                                            Fehlgeschlagen
                                                                        </span>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Email bei Zuweisung (Mitarbeiter) */}
                            <div className="flex items-center justify-between p-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                                        <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-gray-900">E-Mail bei Lead-Zuweisung</h4>
                                        <p className="text-sm text-gray-500">Mitarbeiter erhalt E-Mail mit Bewertungs-Buttons</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="px-3 py-1.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                                        Aktiv
                                    </span>
                                    <Link
                                        href="/dashboard/automations"
                                        className="text-sm text-[#0052FF] font-medium hover:underline"
                                    >
                                        In Automationen anpassen
                                    </Link>
                                </div>
                            </div>

                            {/* WhatsApp */}
                            <div className="flex items-center justify-between p-6 opacity-50">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                                        <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                        </svg>
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-gray-900">WhatsApp</h4>
                                        <p className="text-sm text-gray-500">Sofortige Benachrichtigung per WhatsApp</p>
                                    </div>
                                </div>
                                <span className="px-3 py-1.5 rounded-full bg-gray-100 text-gray-500 text-xs font-medium">
                                    Coming Soon
                                </span>
                            </div>

                            {/* Slack */}
                            <div className="flex items-center justify-between p-6 opacity-50">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                                        <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
                                        </svg>
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-gray-900">Slack Integration</h4>
                                        <p className="text-sm text-gray-500">Leads direkt in deinem Slack Channel</p>
                                    </div>
                                </div>
                                <span className="px-3 py-1.5 rounded-full bg-gray-100 text-gray-500 text-xs font-medium">
                                    Coming Soon
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Webhook Info */}
                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                        <div className="flex items-start gap-4">
                            <div className="w-10 h-10 rounded-lg bg-[#0052FF]/10 flex items-center justify-center flex-shrink-0">
                                <svg className="w-5 h-5 text-[#0052FF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                                </svg>
                            </div>
                            <div className="flex-1">
                                <h3 className="font-semibold text-gray-900 mb-1">Webhook URL</h3>
                                <p className="text-sm text-gray-500 mb-4">
                                    Konfiguriere diese URL in deiner Meta App unter Webhooks → leadgen
                                </p>
                                <div className="flex gap-3">
                                    <input
                                        type="text"
                                        readOnly
                                        value={webhookUrl}
                                        className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 font-mono text-sm"
                                    />
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(webhookUrl);
                                            alert('URL kopiert!');
                                        }}
                                        className="px-4 py-2.5 rounded-lg bg-[#0052FF] text-white text-sm font-medium hover:bg-[#0047E1] transition-colors"
                                    >
                                        Kopieren
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Help Link */}
                    <div className="bg-[#0052FF]/5 rounded-xl border border-[#0052FF]/10 p-6">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-lg bg-[#0052FF]/10 flex items-center justify-center">
                                    <svg className="w-5 h-5 text-[#0052FF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900">Hilfe benotigt?</h3>
                                    <p className="text-sm text-gray-600">Erfahre wie outrnk Leads funktioniert</p>
                                </div>
                            </div>
                            <Link
                                href="/faq"
                                className="px-4 py-2.5 rounded-lg bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                                FAQ lesen
                            </Link>
                        </div>
                    </div>
                </>
            ) : activeTab === 'branding' ? (
                /* Branding Tab */
                <BrandingEditor />
            ) : (
                /* Meta Setup Guide Tab */
                <MetaSetupGuide />
            )}
        </div>
    );
}

function PushNotificationToggle() {
    const [permission, setPermission] = useState<NotificationPermission>('default');
    const [supported, setSupported] = useState(false);

    useEffect(() => {
        if (typeof window !== 'undefined' && 'Notification' in window) {
            setSupported(true);
            setPermission(Notification.permission);
        }
    }, []);

    const requestPermission = async () => {
        if (!supported) return;
        const result = await Notification.requestPermission();
        setPermission(result);
        if (result === 'granted') {
            new Notification('outrnk Leads', {
                body: 'Push-Benachrichtigungen aktiviert!',
            });
        }
    };

    if (!supported) {
        return <span className="text-xs text-gray-400">Nicht unterstutzt</span>;
    }

    if (permission === 'granted') {
        return (
            <span className="px-3 py-1.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                Aktiv
            </span>
        );
    }

    if (permission === 'denied') {
        return (
            <span className="px-3 py-1.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                Blockiert
            </span>
        );
    }

    return (
        <button
            onClick={requestPermission}
            className="px-4 py-2 rounded-lg bg-[#0052FF] text-white text-xs font-medium hover:bg-[#0047E1] transition-colors"
        >
            Aktivieren
        </button>
    );
}

function BrandingEditor() {
    const [companyName, setCompanyName] = useState('');
    const [logoUrl, setLogoUrl] = useState('');
    const [primaryColor, setPrimaryColor] = useState('#0052FF');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Load branding settings
    useEffect(() => {
        fetchBranding();
    }, []);

    const fetchBranding = async () => {
        try {
            const res = await fetch('/api/settings/branding');
            const data = await res.json();
            setCompanyName(data.companyName || '');
            setLogoUrl(data.logoUrl || '');
            setPrimaryColor(data.primaryColor || '#0052FF');
        } catch (error) {
            console.error('Error loading branding:', error);
        }
        setLoading(false);
    };

    const handleLogoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            toast.error('Bitte lade ein Bild hoch (PNG, JPG, SVG)');
            return;
        }

        // Validate file size (max 500KB)
        if (file.size > 500 * 1024) {
            toast.error('Logo ist zu groß. Maximale Größe: 500KB');
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                // Create canvas to resize if needed
                const canvas = document.createElement('canvas');
                const maxWidth = 400;
                const maxHeight = 100;
                let { width, height } = img;

                // Calculate new dimensions
                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width *= ratio;
                    height *= ratio;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);

                // Convert to data URL
                const dataUrl = canvas.toDataURL(file.type, 0.9);
                setLogoUrl(dataUrl);
                setHasChanges(true);
            };
            img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch('/api/settings/branding', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    companyName: companyName || null,
                    logoUrl: logoUrl || null,
                    primaryColor: primaryColor || null,
                }),
            });

            if (res.ok) {
                toast.success('Branding gespeichert');
                setHasChanges(false);
            } else {
                const data = await res.json();
                toast.error(data.error || 'Fehler beim Speichern');
            }
        } catch (error) {
            console.error('Error saving branding:', error);
            toast.error('Fehler beim Speichern');
        }
        setSaving(false);
    };

    const handleReset = async () => {
        if (!confirm('Branding wirklich zurücksetzen? Das Logo und der Firmenname werden entfernt.')) return;

        try {
            const res = await fetch('/api/settings/branding', { method: 'DELETE' });
            if (res.ok) {
                setCompanyName('');
                setLogoUrl('');
                setPrimaryColor('#0052FF');
                setHasChanges(false);
                toast.success('Branding zurückgesetzt');
            }
        } catch (error) {
            console.error('Error resetting branding:', error);
            toast.error('Fehler beim Zurücksetzen');
        }
    };

    if (loading) {
        return (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="animate-pulse space-y-4">
                    <div className="h-6 bg-gray-200 rounded w-1/3"></div>
                    <div className="h-40 bg-gray-200 rounded"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-start justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">Whitelabel Branding</h2>
                        <p className="text-sm text-gray-500 mt-1">
                            Passe das Erscheinungsbild für deine Team-Mitglieder an. Dein Logo und Firmenname erscheinen im Portal und in E-Mails.
                        </p>
                    </div>
                    {(companyName || logoUrl) && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                            Aktiv
                        </span>
                    )}
                </div>
            </div>

            {/* Company Name */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-medium text-gray-900 mb-4">Firmenname</h3>
                <div className="space-y-3">
                    <input
                        type="text"
                        value={companyName}
                        onChange={(e) => {
                            setCompanyName(e.target.value);
                            setHasChanges(true);
                        }}
                        placeholder="z.B. Meine Firma GmbH"
                        className="w-full max-w-md px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#0052FF] focus:border-[#0052FF] outline-none"
                    />
                    <p className="text-xs text-gray-500">
                        Dieser Name ersetzt "outrnk Leads" in E-Mails und im Portal für deine Team-Mitglieder.
                    </p>
                </div>
            </div>

            {/* Logo Upload */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-medium text-gray-900 mb-4">Logo</h3>
                <div className="space-y-4">
                    {/* Logo Preview */}
                    <div className="flex items-start gap-6">
                        <div
                            className="w-[200px] h-[60px] border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center bg-gray-50 cursor-pointer hover:border-[#0052FF] hover:bg-[#0052FF]/5 transition-colors"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            {logoUrl ? (
                                <img
                                    src={logoUrl}
                                    alt="Logo"
                                    className="max-w-full max-h-full object-contain p-2"
                                />
                            ) : (
                                <div className="text-center">
                                    <svg className="w-6 h-6 text-gray-400 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    <span className="text-xs text-gray-500">Logo hochladen</span>
                                </div>
                            )}
                        </div>
                        <div className="flex-1">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleLogoUpload}
                                className="hidden"
                            />
                            <div className="space-y-2">
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
                                >
                                    {logoUrl ? 'Logo ändern' : 'Logo hochladen'}
                                </button>
                                {logoUrl && (
                                    <button
                                        onClick={() => {
                                            setLogoUrl('');
                                            setHasChanges(true);
                                        }}
                                        className="ml-2 px-4 py-2 text-red-600 text-sm font-medium hover:bg-red-50 rounded-lg transition-colors"
                                    >
                                        Entfernen
                                    </button>
                                )}
                            </div>
                            <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                                <p className="text-xs text-gray-600 font-medium mb-1">Empfehlungen:</p>
                                <ul className="text-xs text-gray-500 space-y-0.5">
                                    <li>• Format: PNG, JPG oder SVG</li>
                                    <li>• Ideale Größe: 400 x 100 Pixel</li>
                                    <li>• Maximale Dateigröße: 500KB</li>
                                    <li>• Transparenter Hintergrund empfohlen</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Primary Color */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-medium text-gray-900 mb-4">Primärfarbe (optional)</h3>
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <input
                            type="color"
                            value={primaryColor}
                            onChange={(e) => {
                                setPrimaryColor(e.target.value);
                                setHasChanges(true);
                            }}
                            className="w-12 h-12 rounded-lg cursor-pointer border-2 border-gray-200"
                        />
                    </div>
                    <div className="flex-1">
                        <input
                            type="text"
                            value={primaryColor}
                            onChange={(e) => {
                                if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) {
                                    setPrimaryColor(e.target.value);
                                    setHasChanges(true);
                                }
                            }}
                            placeholder="#0052FF"
                            className="w-32 px-3 py-2 border border-gray-200 rounded-lg font-mono text-sm focus:ring-2 focus:ring-[#0052FF] focus:border-[#0052FF] outline-none"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Farbe für Buttons in E-Mails und im Portal.
                        </p>
                    </div>
                </div>
            </div>

            {/* Preview */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-medium text-gray-900 mb-4">Vorschau: E-Mail Header</h3>
                <div className="bg-gray-100 rounded-xl p-6">
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 max-w-[560px] mx-auto overflow-hidden">
                        {/* Email Header Preview */}
                        <div className="p-6 border-b border-gray-200">
                            <div className="flex items-center gap-3">
                                {logoUrl ? (
                                    <img src={logoUrl} alt="Logo" className="h-8 max-w-[150px] object-contain" />
                                ) : (
                                    <span className="text-xl font-bold text-gray-900">
                                        {companyName || 'outrnk'}<span style={{ color: primaryColor }}>.</span>
                                    </span>
                                )}
                                {!logoUrl && (
                                    <>
                                        <span className="text-gray-300">|</span>
                                        <span className="text-gray-500 text-sm">Leads</span>
                                    </>
                                )}
                            </div>
                        </div>
                        {/* Sample Content */}
                        <div className="p-6">
                            <span
                                className="inline-block px-2.5 py-1 rounded text-xs font-semibold uppercase"
                                style={{ backgroundColor: `${primaryColor}20`, color: primaryColor }}
                            >
                                Willkommen
                            </span>
                            <h2 className="text-lg font-semibold text-gray-900 mt-2">Hallo Max Mustermann!</h2>
                            <p className="text-gray-600 text-sm mt-2">
                                Du wurdest als Team-Mitglied hinzugefügt...
                            </p>
                            <button
                                className="mt-4 px-5 py-2.5 text-white text-sm font-medium rounded-lg"
                                style={{ backgroundColor: primaryColor }}
                            >
                                Portal öffnen
                            </button>
                        </div>
                        {/* Footer */}
                        <div className="p-4 bg-gray-50 border-t border-gray-200 text-center">
                            <p className="text-xs text-gray-400">
                                Automatisch gesendet von {companyName || 'outrnk. Leads'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between">
                <button
                    onClick={handleReset}
                    disabled={!companyName && !logoUrl}
                    className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Auf Standard zurücksetzen
                </button>
                <div className="flex items-center gap-3">
                    <button
                        onClick={fetchBranding}
                        className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
                    >
                        Abbrechen
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || !hasChanges}
                        className="px-6 py-2 bg-[#0052FF] text-white rounded-lg text-sm font-medium hover:bg-[#0047E1] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {saving ? 'Wird gespeichert...' : 'Speichern'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function MetaSetupGuide() {
    const [expandedStep, setExpandedStep] = useState<number | null>(1);

    const steps = [
        {
            number: 1,
            title: 'Verbinde Meta mit outrnk Leads',
            subtitle: 'Bereits erledigt wenn du verbunden bist',
            icon: (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2.04c-5.5 0-10 4.49-10 10.02 0 5 3.66 9.15 8.44 9.9v-7H7.9v-2.9h2.54V9.85c0-2.51 1.49-3.89 3.78-3.89 1.09 0 2.23.19 2.23.19v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.9h-2.33v7a10 10 0 0 0 8.44-9.9c0-5.53-4.5-10.02-10-10.02z" />
                </svg>
            ),
            content: (
                <div className="space-y-4">
                    <p className="text-gray-600">
                        Gehe zum Tab <span className="font-semibold text-gray-900">"Allgemein"</span> und klicke auf <span className="font-semibold text-[#0052FF]">"Mit Meta verbinden"</span>.
                    </p>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <div className="flex gap-3">
                            <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <div>
                                <p className="font-medium text-amber-800">Wichtig</p>
                                <p className="text-sm text-amber-700">Du brauchst Admin-Zugriff auf dein Meta Business Manager Konto.</p>
                            </div>
                        </div>
                    </div>
                </div>
            ),
        },
        {
            number: 2,
            title: 'Sende Signale an Meta',
            subtitle: 'Uber das Kanban-Board',
            icon: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
            ),
            content: (
                <div className="space-y-4">
                    <p className="text-gray-600">
                        Wenn du einen Lead im Kanban-Board offnest, siehst du den Bereich <span className="font-semibold text-gray-900">"Meta Signale"</span>.
                    </p>
                    <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                        <p className="text-sm font-medium text-gray-700">Verfugbare Signale:</p>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="flex items-center gap-2 bg-green-50 text-green-700 px-3 py-2 rounded-lg text-sm">
                                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                Interessiert
                            </div>
                            <div className="flex items-center gap-2 bg-green-50 text-green-700 px-3 py-2 rounded-lg text-sm">
                                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                Termin
                            </div>
                            <div className="flex items-center gap-2 bg-green-50 text-green-700 px-3 py-2 rounded-lg text-sm">
                                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                Gewonnen
                            </div>
                            <div className="flex items-center gap-2 bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm">
                                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                Verloren
                            </div>
                        </div>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div className="flex gap-3">
                            <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div>
                                <p className="font-medium text-blue-800">Tipp</p>
                                <p className="text-sm text-blue-700">Du kannst mehrere Signale pro Lead senden - z.B. erst "Interessiert", dann spater "Gewonnen".</p>
                            </div>
                        </div>
                    </div>
                </div>
            ),
        },
        {
            number: 3,
            title: 'Warte 7 Tage',
            subtitle: 'Meta sammelt Daten',
            icon: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            ),
            content: (
                <div className="space-y-4">
                    <p className="text-gray-600">
                        Meta braucht <span className="font-semibold text-gray-900">mindestens 7 Tage</span> Daten bevor du den Sales Funnel konfigurieren kannst.
                    </p>
                    <div className="bg-gray-50 rounded-xl p-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-[#0052FF]/10 flex items-center justify-center">
                                <span className="text-[#0052FF] font-bold text-lg">7+</span>
                            </div>
                            <div>
                                <p className="font-medium text-gray-900">Mindestanforderungen</p>
                                <p className="text-sm text-gray-500">50+ Events taglich uber min. 2 Stufen fur 7 Tage</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <div className="flex gap-3">
                            <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <div>
                                <p className="font-medium text-amber-800">Wichtig</p>
                                <p className="text-sm text-amber-700">Du brauchst ca. 200+ Leads pro Monat fur Conversion Leads Optimierung.</p>
                            </div>
                        </div>
                    </div>
                </div>
            ),
        },
        {
            number: 4,
            title: 'Konfiguriere den Sales Funnel in Meta',
            subtitle: 'Im Events Manager',
            icon: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            ),
            content: (
                <div className="space-y-4">
                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                            <p className="font-medium text-gray-900">Schritt-fur-Schritt Anleitung</p>
                        </div>
                        <div className="p-4 space-y-4">
                            <div className="flex gap-3">
                                <div className="w-6 h-6 rounded-full bg-[#0052FF] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">1</div>
                                <div>
                                    <p className="font-medium text-gray-900">Offne Meta Events Manager</p>
                                    <p className="text-sm text-gray-500">business.facebook.com → Events Manager</p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <div className="w-6 h-6 rounded-full bg-[#0052FF] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">2</div>
                                <div>
                                    <p className="font-medium text-gray-900">Wahle deine Datenquelle (Pixel)</p>
                                    <p className="text-sm text-gray-500">Die CRM-Verbindung die du mit outrnk Leads nutzt</p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <div className="w-6 h-6 rounded-full bg-[#0052FF] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">3</div>
                                <div>
                                    <p className="font-medium text-gray-900">Gehe zu "Einstellungen" (Settings)</p>
                                    <p className="text-sm text-gray-500">Klicke auf "Sales Funnel konfigurieren"</p>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <div className="w-6 h-6 rounded-full bg-[#0052FF] text-white flex items-center justify-center text-xs font-bold flex-shrink-0">4</div>
                                <div>
                                    <p className="font-medium text-gray-900">Ordne die Stufen per Drag & Drop</p>
                                    <p className="text-sm text-gray-500">Wichtigste (Gewonnen) oben, unwichtigste unten</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                        <p className="font-medium text-gray-900 mb-3">Empfohlene Funnel-Reihenfolge:</p>
                        <div className="space-y-2">
                            <div className="flex items-center gap-3">
                                <span className="text-lg">🥇</span>
                                <div className="flex-1 bg-green-100 text-green-800 px-3 py-2 rounded-lg text-sm font-medium">
                                    Gewonnen (won) - Hochste Prioritat
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-lg">🥈</span>
                                <div className="flex-1 bg-indigo-100 text-indigo-800 px-3 py-2 rounded-lg text-sm font-medium">
                                    Termin (meeting)
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-lg">🥉</span>
                                <div className="flex-1 bg-purple-100 text-purple-800 px-3 py-2 rounded-lg text-sm font-medium">
                                    Interessiert (interested)
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-lg">❌</span>
                                <div className="flex-1 bg-red-100 text-red-800 px-3 py-2 rounded-lg text-sm font-medium">
                                    Verloren (lost) - Negatives Signal
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ),
        },
        {
            number: 5,
            title: 'Wahle das Optimierungsziel',
            subtitle: 'Fur welche Stufe Meta optimieren soll',
            icon: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
            ),
            content: (
                <div className="space-y-4">
                    <p className="text-gray-600">
                        Unter <span className="font-semibold text-gray-900">"Optimierungsziel"</span> wahlst du aus, fur welche Stufe Meta deine Ads optimieren soll.
                    </p>

                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <div className="flex gap-3">
                            <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div>
                                <p className="font-medium text-green-800">Empfehlung</p>
                                <p className="text-sm text-green-700">Wahle die Stufe mit einer <span className="font-semibold">1-40% Conversion Rate</span>. Meistens ist das "Gewonnen" oder "Termin".</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-gray-50 rounded-xl p-4">
                        <p className="text-sm text-gray-600">
                            <span className="font-semibold text-gray-900">Seit September 2025:</span> Du kannst das Optimierungsziel auch direkt beim Erstellen einer Ad Set wahlen - die Funnel-Konfiguration im Events Manager ist dann optional.
                        </p>
                    </div>
                </div>
            ),
        },
        {
            number: 6,
            title: 'Erstelle eine optimierte Kampagne',
            subtitle: 'Im Ads Manager',
            icon: (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                </svg>
            ),
            content: (
                <div className="space-y-4">
                    <p className="text-gray-600">
                        Wenn du eine neue Lead-Kampagne erstellst, wahle diese Einstellungen:
                    </p>

                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                        <table className="w-full text-sm">
                            <tbody className="divide-y divide-gray-100">
                                <tr>
                                    <td className="px-4 py-3 bg-gray-50 font-medium text-gray-700 w-1/3">Conversion Location</td>
                                    <td className="px-4 py-3 text-gray-900">Instant Forms</td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-3 bg-gray-50 font-medium text-gray-700">Performance Goal</td>
                                    <td className="px-4 py-3 text-gray-900">Maximise number of <span className="text-[#0052FF] font-semibold">conversion leads</span></td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-3 bg-gray-50 font-medium text-gray-700">Dataset</td>
                                    <td className="px-4 py-3 text-gray-900">[Dein Page Name] Event Data</td>
                                </tr>
                                <tr>
                                    <td className="px-4 py-3 bg-gray-50 font-medium text-gray-700">Conversion Event</td>
                                    <td className="px-4 py-3 text-gray-900">Deine gewunschte Stufe (z.B. "won")</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="bg-[#0052FF]/5 border border-[#0052FF]/20 rounded-lg p-4">
                        <div className="flex gap-3">
                            <svg className="w-5 h-5 text-[#0052FF] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                            </svg>
                            <div>
                                <p className="font-medium text-[#0052FF]">Ergebnis</p>
                                <p className="text-sm text-gray-700">Meta findet jetzt Personen die eher zu "Gewonnen" konvertieren - nicht nur Formular-Ausfuller!</p>
                            </div>
                        </div>
                    </div>
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-6">
            {/* Header Card */}
            <div className="bg-gradient-to-r from-[#0052FF] to-[#0047E1] rounded-2xl p-6 text-white">
                <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold mb-1">Meta Conversion Leads Optimierung</h2>
                        <p className="text-white/80 text-sm">
                            Lerne wie du Meta beibringst, bessere Leads zu finden - basierend auf deinen echten Verkaufen.
                        </p>
                    </div>
                </div>
            </div>

            {/* What is it? */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900 mb-3">Was ist Conversion Leads Optimierung?</h3>
                <p className="text-gray-600 mb-4">
                    Normalerweise optimiert Meta nur darauf, dass Leute dein Formular ausfullen. Mit <span className="font-semibold text-gray-900">Conversion Leads</span> sagst du Meta welche dieser Leads wirklich zu Kunden wurden - und Meta lernt daraus.
                </p>
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-red-50 rounded-xl p-4 border border-red-100">
                        <div className="flex items-center gap-2 mb-2">
                            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            <span className="font-medium text-red-800">Ohne Conversion Leads</span>
                        </div>
                        <p className="text-sm text-red-700">Meta optimiert fur Formular-Ausfuller - egal ob sie kaufen oder nicht</p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-4 border border-green-100">
                        <div className="flex items-center gap-2 mb-2">
                            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="font-medium text-green-800">Mit Conversion Leads</span>
                        </div>
                        <p className="text-sm text-green-700">Meta optimiert fur echte Kaufer - bis zu 15% niedrigere Kosten pro qualifiziertem Lead</p>
                    </div>
                </div>
            </div>

            {/* Prerequisites */}
            <div className="bg-amber-50 rounded-xl border border-amber-200 p-6">
                <h3 className="font-semibold text-amber-900 mb-3 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Voraussetzungen
                </h3>
                <ul className="space-y-2 text-sm text-amber-800">
                    <li className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" />
                        </svg>
                        Meta Business Account mit Admin-Zugriff
                    </li>
                    <li className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" />
                        </svg>
                        Mindestens 200+ Leads pro Monat
                    </li>
                    <li className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" />
                        </svg>
                        Aktive Facebook Lead Ads Kampagnen
                    </li>
                    <li className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" />
                        </svg>
                        Lead-Stufe mit 1-40% Conversion Rate
                    </li>
                </ul>
            </div>

            {/* Steps */}
            <div className="space-y-3">
                {steps.map((step) => (
                    <div
                        key={step.number}
                        className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                    >
                        <button
                            onClick={() => setExpandedStep(expandedStep === step.number ? null : step.number)}
                            className="w-full px-6 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors"
                        >
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                                expandedStep === step.number ? 'bg-[#0052FF] text-white' : 'bg-gray-100 text-gray-600'
                            }`}>
                                {step.icon}
                            </div>
                            <div className="flex-1 text-left">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-[#0052FF]">SCHRITT {step.number}</span>
                                </div>
                                <h4 className="font-semibold text-gray-900">{step.title}</h4>
                                <p className="text-sm text-gray-500">{step.subtitle}</p>
                            </div>
                            <svg
                                className={`w-5 h-5 text-gray-400 transition-transform ${expandedStep === step.number ? 'rotate-180' : ''}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                        {expandedStep === step.number && (
                            <div className="px-6 pb-6 pt-2 border-t border-gray-100">
                                {step.content}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Help Links */}
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Weitere Hilfe</h3>
                <div className="grid grid-cols-2 gap-4">
                    <a
                        href="https://www.facebook.com/business/help/331612538028890"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-[#0052FF] hover:shadow-md transition-all"
                    >
                        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                            <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2.04c-5.5 0-10 4.49-10 10.02 0 5 3.66 9.15 8.44 9.9v-7H7.9v-2.9h2.54V9.85c0-2.51 1.49-3.89 3.78-3.89 1.09 0 2.23.19 2.23.19v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.9h-2.33v7a10 10 0 0 0 8.44-9.9c0-5.53-4.5-10.02-10-10.02z" />
                            </svg>
                        </div>
                        <div>
                            <p className="font-medium text-gray-900">Meta Help Center</p>
                            <p className="text-xs text-gray-500">Offizielle Dokumentation</p>
                        </div>
                    </a>
                    <a
                        href="https://help.privyr.com/knowledge-base/meta-conversions-api/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-[#0052FF] hover:shadow-md transition-all"
                    >
                        <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                            <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                            </svg>
                        </div>
                        <div>
                            <p className="font-medium text-gray-900">Ausfuhrlicher Guide</p>
                            <p className="text-xs text-gray-500">Mit Screenshots</p>
                        </div>
                    </a>
                </div>
            </div>
        </div>
    );
}
