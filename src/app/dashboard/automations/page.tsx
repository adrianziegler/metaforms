'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import EmailTemplateEditor from '@/components/EmailTemplateEditor';

interface EmailBlock {
    id: string;
    type: 'heading' | 'text' | 'button' | 'divider' | 'image';
    text?: string;
    url?: string;
    src?: string;
    alt?: string;
}

interface Template {
    id: string;
    name: string;
    type: 'email' | 'whatsapp';
    trigger: 'new_lead' | 'lead_assigned';
    form_id: string | null;
    form_name: string | null;
    subject: string | null;
    sender_name: string | null;
    content: { blocks?: EmailBlock[]; message?: string };
    is_active: boolean;
    branding_preset_id: string | null;
    created_at: string;
}

interface BrandingPreset {
    id: string;
    name: string;
    logo_url: string | null;
    company_name: string | null;
    primary_color: string;
    footer_text: string | null;
    is_default: boolean;
}

interface FormOption {
    form_id: string;
    form_name: string;
}

interface FormAliasEntry {
    form_id: string;
    original_name: string;
    display_name: string | null;
    alias_id: string | null;
}

interface LogEntry {
    id: string;
    type: string;
    recipient: string;
    subject: string | null;
    status: string;
    error_message: string | null;
    sent_at: string;
    template_name: string | null;
    lead_name: string | null;
}

interface Settings {
    autoEmailEnabled: boolean;
    autoWhatsappEnabled: boolean;
    whatsappApiKey: string | null;
    whatsappApiKeySet: boolean;
    resendApiKey: string | null;
    resendApiKeySet: boolean;
    resendFromEmail: string | null;
}

interface Branding {
    companyName: string | null;
    logoUrl: string | null;
    primaryColor: string | null;
}

const PRESET_TEMPLATES: { name: string; type: 'email' | 'whatsapp'; subject?: string; content: unknown }[] = [
    {
        name: 'Danke fur deine Anfrage',
        type: 'email',
        subject: 'Danke fur deine Anfrage, {{first_name}}!',
        content: {
            blocks: [
                { id: '1', type: 'heading', text: 'Danke fur deine Anfrage, {{first_name}}!' },
                { id: '2', type: 'text', text: 'Wir haben deine Anfrage erhalten und werden uns schnellstmoglich bei dir melden.\n\nIn der Zwischenzeit kannst du dich gerne auf unserer Website umsehen.' },
                { id: '3', type: 'button', text: 'Zur Website', url: 'https://example.com' },
                { id: '4', type: 'divider' },
                { id: '5', type: 'text', text: 'Viele Grusse\n{{company_name}}' },
            ],
        },
    },
    {
        name: 'Willkommen',
        type: 'email',
        subject: 'Willkommen bei {{company_name}}, {{first_name}}!',
        content: {
            blocks: [
                { id: '1', type: 'heading', text: 'Willkommen, {{first_name}}!' },
                { id: '2', type: 'text', text: 'Schon, dass du dich bei uns eingetragen hast. Wir freuen uns darauf, dir weiterzuhelfen.\n\nWas passiert als nachstes?\nEin Mitarbeiter wird sich in Kurze bei dir melden, um alle Details zu besprechen.' },
                { id: '3', type: 'button', text: 'Mehr erfahren', url: 'https://example.com' },
                { id: '4', type: 'divider' },
                { id: '5', type: 'text', text: 'Bei Fragen erreichst du uns jederzeit.\n\nDein {{company_name}} Team' },
            ],
        },
    },
    {
        name: 'Termin vereinbaren',
        type: 'email',
        subject: '{{first_name}}, lass uns einen Termin vereinbaren!',
        content: {
            blocks: [
                { id: '1', type: 'heading', text: 'Hallo {{first_name}}!' },
                { id: '2', type: 'text', text: 'Vielen Dank fur dein Interesse! Um dir das beste Angebot zu machen, wurden wir gerne einen kurzen Termin mit dir vereinbaren.\n\nKlicke einfach auf den Button und wahle einen passenden Zeitpunkt.' },
                { id: '3', type: 'button', text: 'Termin buchen', url: 'https://calendly.com/example' },
                { id: '4', type: 'divider' },
                { id: '5', type: 'text', text: 'Wir freuen uns auf das Gesprach!\n\nDein {{company_name}} Team' },
            ],
        },
    },
    {
        name: 'WhatsApp Willkommen',
        type: 'whatsapp',
        content: {
            message: 'Hallo {{first_name}}! 👋\n\nDanke fur deine Anfrage bei {{company_name}}. Wir haben deine Daten erhalten und werden uns schnellstmoglich bei dir melden.\n\nBei Fragen kannst du einfach hier antworten.\n\nViele Grusse',
        },
    },
];

const LEAD_VARIABLES = [
    { key: '{{full_name}}', label: 'Voller Name' },
    { key: '{{first_name}}', label: 'Vorname' },
    { key: '{{last_name}}', label: 'Nachname' },
    { key: '{{email}}', label: 'E-Mail' },
    { key: '{{phone}}', label: 'Telefon' },
    { key: '{{form_name}}', label: 'Formular-Name' },
    { key: '{{company_name}}', label: 'Firmenname' },
];

const ASSIGNEE_VARIABLES = [
    { key: '{{assignee_name}}', label: 'Mitarbeiter-Name' },
    { key: '{{assignee_email}}', label: 'Mitarbeiter-E-Mail' },
];

function genId() {
    return Math.random().toString(36).substring(2, 9);
}

export default function AutomationsPage() {
    const [templates, setTemplates] = useState<Template[]>([]);
    const [forms, setForms] = useState<FormOption[]>([]);
    const [settings, setSettings] = useState<Settings>({
        autoEmailEnabled: false, autoWhatsappEnabled: false,
        whatsappApiKey: null, whatsappApiKeySet: false,
        resendApiKey: null, resendApiKeySet: false, resendFromEmail: null,
    });
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [branding, setBranding] = useState<Branding>({ companyName: null, logoUrl: null, primaryColor: null });
    const [brandingPresets, setBrandingPresets] = useState<BrandingPreset[]>([]);
    const [loading, setLoading] = useState(true);
    const [mainCategory, setMainCategory] = useState<'external' | 'internal'>('external');
    const [activeView, setActiveView] = useState<'templates' | 'logs' | 'settings'>('templates');
    const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
    const [showNewDialog, setShowNewDialog] = useState(false);
    const [saving, setSaving] = useState(false);

    // WhatsApp settings form
    const [waKeyInput, setWaKeyInput] = useState('');

    // Resend settings form
    const [resendKeyInput, setResendKeyInput] = useState('');
    const [resendEmailInput, setResendEmailInput] = useState('');

    // Branding preset form
    const [editingPreset, setEditingPreset] = useState<BrandingPreset | null>(null);
    const [presetForm, setPresetForm] = useState({ name: '', logoUrl: '', companyName: '', primaryColor: '#0052FF', footerText: '', isDefault: false });
    const [savingPreset, setSavingPreset] = useState(false);

    // Form aliases
    const [formAliases, setFormAliases] = useState<FormAliasEntry[]>([]);
    const [editingAliasId, setEditingAliasId] = useState<string | null>(null);
    const [aliasInput, setAliasInput] = useState('');

    const fetchAll = useCallback(async () => {
        try {
            const [tRes, sRes, lRes] = await Promise.all([
                fetch('/api/automations/templates'),
                fetch('/api/automations/settings'),
                fetch('/api/automations/logs?limit=30'),
            ]);
            const tData = await tRes.json();
            const sData = await sRes.json();
            const lData = await lRes.json();
            setTemplates(tData.templates || []);
            setForms(tData.forms || []);
            setSettings(sData);
            setLogs(lData.logs || []);
            // Fetch branding separately to not break other fetches
            try {
                const bRes = await fetch('/api/settings/branding');
                if (bRes.ok) {
                    const bData = await bRes.json();
                    setBranding({ companyName: bData.companyName || null, logoUrl: bData.logoUrl || null, primaryColor: bData.primaryColor || null });
                }
            } catch (brandingErr) {
                console.error('Branding fetch error:', brandingErr);
            }
            // Fetch branding presets
            try {
                const pRes = await fetch('/api/automations/branding-presets');
                if (pRes.ok) {
                    const pData = await pRes.json();
                    setBrandingPresets(pData.presets || []);
                }
            } catch (presetsErr) {
                console.error('Branding presets fetch error:', presetsErr);
            }
            // Fetch form aliases
            try {
                const faRes = await fetch('/api/settings/form-aliases');
                if (faRes.ok) {
                    const faData = await faRes.json();
                    setFormAliases(faData.forms || []);
                }
            } catch (aliasErr) {
                console.error('Form aliases fetch error:', aliasErr);
            }
        } catch (err) {
            console.error('Fetch error:', err);
        }
        setLoading(false);
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const handleToggleSetting = async (key: string, value: boolean) => {
        const prev = { ...settings };
        setSettings({ ...settings, [key]: value });
        try {
            const res = await fetch('/api/automations/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [key]: value }),
            });
            if (!res.ok) { setSettings(prev); toast.error('Fehler beim Speichern'); }
        } catch {
            setSettings(prev);
        }
    };

    const handleSaveWaKey = async () => {
        try {
            const res = await fetch('/api/automations/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ whatsappApiKey: waKeyInput }),
            });
            if (res.ok) {
                toast.success('WhatsApp API Key gespeichert');
                setWaKeyInput('');
                fetchAll();
            }
        } catch { toast.error('Fehler'); }
    };

    const handleSaveResend = async () => {
        if (!resendKeyInput || !resendEmailInput) {
            toast.error('API Key und Absender-E-Mail sind erforderlich');
            return;
        }
        try {
            const res = await fetch('/api/automations/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ resendApiKey: resendKeyInput, resendFromEmail: resendEmailInput }),
            });
            if (res.ok) {
                toast.success('Resend Konfiguration gespeichert');
                setResendKeyInput('');
                setResendEmailInput('');
                fetchAll();
            } else {
                const data = await res.json();
                toast.error(data.error || 'Fehler');
            }
        } catch { toast.error('Fehler'); }
    };

    const handleRemoveResend = async () => {
        if (!confirm('Resend-Verbindung wirklich entfernen? E-Mails werden dann uber das Standard-System gesendet.')) return;
        try {
            const res = await fetch('/api/automations/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ resendApiKey: null, resendFromEmail: null }),
            });
            if (res.ok) {
                toast.success('Resend-Verbindung entfernt');
                fetchAll();
            }
        } catch { toast.error('Fehler'); }
    };

    const handleSavePreset = async () => {
        if (!presetForm.name.trim()) {
            toast.error('Name ist erforderlich');
            return;
        }
        setSavingPreset(true);
        try {
            const method = editingPreset ? 'PATCH' : 'POST';
            const body = editingPreset
                ? { id: editingPreset.id, ...presetForm }
                : presetForm;
            const res = await fetch('/api/automations/branding-presets', {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (res.ok) {
                toast.success(editingPreset ? 'Preset aktualisiert' : 'Preset erstellt');
                setEditingPreset(null);
                setPresetForm({ name: '', logoUrl: '', companyName: '', primaryColor: '#0052FF', footerText: '', isDefault: false });
                fetchAll();
            } else {
                const data = await res.json();
                toast.error(data.error || 'Fehler');
            }
        } catch { toast.error('Fehler'); }
        setSavingPreset(false);
    };

    const handleEditPreset = (preset: BrandingPreset) => {
        setEditingPreset(preset);
        setPresetForm({
            name: preset.name,
            logoUrl: preset.logo_url || '',
            companyName: preset.company_name || '',
            primaryColor: preset.primary_color,
            footerText: preset.footer_text || '',
            isDefault: preset.is_default,
        });
    };

    const handleDeletePreset = async (id: string) => {
        if (!confirm('Branding-Preset wirklich loschen?')) return;
        try {
            const res = await fetch('/api/automations/branding-presets', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id }),
            });
            if (res.ok) {
                toast.success('Preset geloscht');
                fetchAll();
            } else {
                const data = await res.json();
                toast.error(data.error || 'Fehler');
            }
        } catch { toast.error('Fehler'); }
    };

    const handleCancelPresetEdit = () => {
        setEditingPreset(null);
        setPresetForm({ name: '', logoUrl: '', companyName: '', primaryColor: '#0052FF', footerText: '', isDefault: false });
    };

    // Form alias handlers
    const handleStartEditAlias = (formId: string, currentName: string | null) => {
        setEditingAliasId(formId);
        setAliasInput(currentName || '');
    };

    const handleSaveAlias = async (formId: string, originalName: string) => {
        if (!aliasInput.trim()) {
            // If empty, delete the alias
            try {
                await fetch(`/api/settings/form-aliases?formId=${formId}`, { method: 'DELETE' });
                setFormAliases(prev => prev.map(f =>
                    f.form_id === formId ? { ...f, display_name: null, alias_id: null } : f
                ));
                toast.success('Alias entfernt');
            } catch { toast.error('Fehler'); }
        } else {
            try {
                const res = await fetch('/api/settings/form-aliases', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ formId, originalName, displayName: aliasInput.trim() }),
                });
                if (res.ok) {
                    const data = await res.json();
                    setFormAliases(prev => prev.map(f =>
                        f.form_id === formId ? { ...f, display_name: aliasInput.trim(), alias_id: data.alias?.id } : f
                    ));
                    toast.success('Alias gespeichert');
                } else {
                    toast.error('Fehler beim Speichern');
                }
            } catch { toast.error('Fehler'); }
        }
        setEditingAliasId(null);
        setAliasInput('');
    };

    const handleCancelEditAlias = () => {
        setEditingAliasId(null);
        setAliasInput('');
    };

    const handleToggleTemplate = async (id: string, isActive: boolean) => {
        setTemplates(ts => ts.map(t => t.id === id ? { ...t, is_active: isActive } : t));
        try {
            await fetch('/api/automations/templates', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, isActive }),
            });
        } catch { fetchAll(); }
    };

    const handleDeleteTemplate = async (id: string) => {
        if (!confirm('Template wirklich loschen?')) return;
        try {
            await fetch(`/api/automations/templates?id=${id}`, { method: 'DELETE' });
            setTemplates(ts => ts.filter(t => t.id !== id));
            toast.success('Template geloscht');
        } catch { toast.error('Fehler'); }
    };

    const handleCreateFromPreset = async (preset: typeof PRESET_TEMPLATES[0]) => {
        try {
            const res = await fetch('/api/automations/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: preset.name,
                    type: preset.type,
                    trigger: 'new_lead',
                    subject: preset.subject || null,
                    content: preset.content,
                    isActive: false,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error || 'Fehler beim Erstellen');
                return;
            }
            if (data.template) {
                setTemplates(ts => [data.template, ...ts]);
                setEditingTemplate(data.template);
                setShowNewDialog(false);
                toast.success('Template erstellt - jetzt anpassen!');
            }
        } catch { toast.error('Fehler'); }
    };

    const handleCreateBlank = async (type: 'email' | 'whatsapp') => {
        const content = type === 'email'
            ? { blocks: [{ id: genId(), type: 'heading' as const, text: 'Hallo {{first_name}}!' }, { id: genId(), type: 'text' as const, text: 'Hier Text einfugen...' }] }
            : { message: 'Hallo {{first_name}}!\n\nHier Nachricht einfugen...' };

        try {
            const res = await fetch('/api/automations/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: type === 'email' ? 'Neue E-Mail' : 'Neue WhatsApp Nachricht',
                    type,
                    trigger: 'new_lead',
                    subject: type === 'email' ? 'Nachricht von {{company_name}}' : null,
                    content,
                    isActive: false,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error || 'Fehler beim Erstellen');
                return;
            }
            if (data.template) {
                setTemplates(ts => [data.template, ...ts]);
                setEditingTemplate(data.template);
                setShowNewDialog(false);
            }
        } catch { toast.error('Fehler'); }
    };

    const handleSaveTemplate = async (template: Template) => {
        setSaving(true);
        try {
            const res = await fetch('/api/automations/templates', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: template.id,
                    name: template.name,
                    trigger: template.trigger,
                    formId: template.form_id,
                    formName: template.form_name,
                    subject: template.subject,
                    senderName: template.sender_name,
                    content: template.content,
                    isActive: template.is_active,
                    brandingPresetId: template.branding_preset_id,
                }),
            });
            if (res.ok) {
                const data = await res.json();
                setTemplates(ts => ts.map(t => t.id === template.id ? (data.template || template) : t));
                toast.success('Gespeichert');
            } else {
                toast.error('Fehler beim Speichern');
            }
        } catch { toast.error('Fehler'); }
        setSaving(false);
    };

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="h-8 bg-gray-200 rounded w-1/3 animate-pulse"></div>
                <div className="h-64 bg-gray-100 rounded-xl animate-pulse"></div>
            </div>
        );
    }

    // Template Editor View
    if (editingTemplate) {
        return (
            <TemplateEditor
                template={editingTemplate}
                forms={forms}
                leadVariables={LEAD_VARIABLES}
                assigneeVariables={ASSIGNEE_VARIABLES}
                branding={branding}
                brandingPresets={brandingPresets}
                saving={saving}
                onSave={(t) => { handleSaveTemplate(t); setEditingTemplate(t); }}
                onClose={() => { setEditingTemplate(null); fetchAll(); }}
            />
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Automationen</h1>
                    <p className="text-gray-500 text-sm mt-1">Automatische E-Mails an Leads und Team-Mitglieder</p>
                </div>
                {mainCategory === 'external' && (
                    <button
                        onClick={() => setShowNewDialog(true)}
                        className="px-4 py-2.5 bg-[#0052FF] text-white rounded-lg text-sm font-medium hover:bg-[#0047E1] transition-colors flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        Neues Template
                    </button>
                )}
            </div>

            {/* Main Category Selector */}
            <div className="bg-white rounded-xl border border-gray-200 p-1.5 inline-flex gap-1">
                <button
                    onClick={() => setMainCategory('external')}
                    className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                        mainCategory === 'external'
                            ? 'bg-[#0052FF] text-white'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    Externe E-Mails (Leads)
                </button>
                <button
                    onClick={() => setMainCategory('internal')}
                    className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                        mainCategory === 'internal'
                            ? 'bg-[#0052FF] text-white'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                    Interne E-Mails (Team)
                </button>
            </div>

            {/* Internal Emails Section */}
            {mainCategory === 'internal' && (
                <div className="space-y-6">
                    {/* Info Box */}
                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                        <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                                <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </div>
                            <div>
                                <h3 className="font-medium text-purple-900 text-sm">Interne Team-E-Mails</h3>
                                <p className="text-sm text-purple-700 mt-1">
                                    Diese E-Mails gehen an deine Team-Mitglieder - z.B. wenn ihnen ein Lead zugewiesen wird oder sie neu zum Team hinzugefugt werden.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Email Template Editor */}
                    <EmailTemplateEditor />
                </div>
            )}

            {/* External Emails Section */}
            {mainCategory === 'external' && (
                <>
                    {/* Global Status Cards */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                        </div>
                        <div>
                            <p className="font-medium text-gray-900">Auto E-Mail</p>
                            <p className="text-xs text-gray-500">{templates.filter(t => t.type === 'email' && t.is_active).length} aktive Templates</p>
                        </div>
                    </div>
                    <button
                        onClick={() => handleToggleSetting('autoEmailEnabled', !settings.autoEmailEnabled)}
                        className={`relative w-11 h-6 rounded-full transition-colors ${settings.autoEmailEnabled ? 'bg-[#0052FF]' : 'bg-gray-300'}`}
                    >
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${settings.autoEmailEnabled ? 'translate-x-5' : ''}`} />
                    </button>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                            <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                        </div>
                        <div>
                            <p className="font-medium text-gray-900">Auto WhatsApp</p>
                            <p className="text-xs text-gray-500">{settings.whatsappApiKeySet ? 'API Key konfiguriert' : 'Nicht konfiguriert'}</p>
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            if (!settings.whatsappApiKeySet && !settings.autoWhatsappEnabled) {
                                setActiveView('settings');
                                return;
                            }
                            handleToggleSetting('autoWhatsappEnabled', !settings.autoWhatsappEnabled);
                        }}
                        className={`relative w-11 h-6 rounded-full transition-colors ${settings.autoWhatsappEnabled ? 'bg-green-500' : 'bg-gray-300'}`}
                    >
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${settings.autoWhatsappEnabled ? 'translate-x-5' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="bg-white rounded-xl border border-gray-200 p-1 inline-flex">
                {(['templates', 'logs', 'settings'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveView(tab)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                            activeView === tab ? 'bg-[#0052FF] text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                        }`}
                    >
                        {tab === 'templates' ? 'Templates' : tab === 'logs' ? 'Sende-Protokoll' : 'Einstellungen'}
                    </button>
                ))}
            </div>

            {/* Templates View */}
            {activeView === 'templates' && (
                <div className="space-y-3">
                    {templates.length === 0 ? (
                        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                            </div>
                            <h3 className="font-semibold text-gray-900 mb-1">Noch keine Templates</h3>
                            <p className="text-sm text-gray-500 mb-4">Erstelle dein erstes Auto-Nachrichten Template</p>
                            <button onClick={() => setShowNewDialog(true)} className="px-4 py-2 bg-[#0052FF] text-white rounded-lg text-sm font-medium hover:bg-[#0047E1]">
                                Template erstellen
                            </button>
                        </div>
                    ) : templates.map(t => (
                        <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${t.type === 'email' ? 'bg-blue-100' : 'bg-green-100'}`}>
                                {t.type === 'email' ? (
                                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                ) : (
                                    <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <h3 className="font-medium text-gray-900 truncate">{t.name}</h3>
                                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${t.type === 'email' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                                        {t.type === 'email' ? 'E-Mail' : 'WhatsApp'}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium mr-1.5 ${t.trigger === 'lead_assigned' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>
                                        {t.trigger === 'lead_assigned' ? 'Bei Zuweisung' : 'Bei Eingang'}
                                    </span>
                                    {t.form_name ? `Formular: ${t.form_name}` : 'Alle Formulare'}
                                    {t.subject && ` • Betreff: ${t.subject}`}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => handleToggleTemplate(t.id, !t.is_active)}
                                    className={`relative w-9 h-5 rounded-full transition-colors ${t.is_active ? 'bg-[#0052FF]' : 'bg-gray-300'}`}
                                >
                                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${t.is_active ? 'translate-x-4' : ''}`} />
                                </button>
                                <button onClick={() => setEditingTemplate(t)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                </button>
                                <button onClick={() => handleDeleteTemplate(t.id)} className="p-2 hover:bg-red-50 rounded-lg transition-colors text-gray-400 hover:text-red-600">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Logs View */}
            {activeView === 'logs' && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    {logs.length === 0 ? (
                        <div className="p-12 text-center text-gray-500">Noch keine Nachrichten gesendet</div>
                    ) : (
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Typ</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Empfanger</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Template</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Datum</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {logs.map(log => (
                                    <tr key={log.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3">
                                            <span className={`text-xs font-medium px-2 py-0.5 rounded ${log.type === 'email' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                                                {log.type === 'email' ? 'E-Mail' : 'WhatsApp'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-700">{log.recipient}</td>
                                        <td className="px-4 py-3 text-sm text-gray-500">{log.template_name || '-'}</td>
                                        <td className="px-4 py-3">
                                            <span className={`text-xs font-medium ${log.status === 'sent' ? 'text-green-600' : 'text-red-600'}`}>
                                                {log.status === 'sent' ? 'Gesendet' : 'Fehler'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-400">
                                            {new Date(log.sent_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* Settings View */}
            {activeView === 'settings' && (
                <div className="space-y-6">
                    {/* WhatsApp Configuration */}
                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                                <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-900">WhatsApp API Konfiguration</h3>
                                <p className="text-sm text-gray-500">outrnk WhatsApp API Key fur automatische Nachrichten</p>
                            </div>
                        </div>
                        {settings.whatsappApiKeySet && (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 flex items-center gap-2">
                                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                <span className="text-sm text-green-700">API Key konfiguriert: {settings.whatsappApiKey}</span>
                            </div>
                        )}
                        <div className="flex gap-3">
                            <input
                                type="password"
                                value={waKeyInput}
                                onChange={(e) => setWaKeyInput(e.target.value)}
                                placeholder="wapi_..."
                                className="flex-1 max-w-md px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#0052FF] focus:border-[#0052FF] outline-none font-mono text-sm"
                            />
                            <button
                                onClick={handleSaveWaKey}
                                disabled={!waKeyInput}
                                className="px-4 py-2.5 bg-[#0052FF] text-white rounded-lg text-sm font-medium hover:bg-[#0047E1] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Speichern
                            </button>
                        </div>
                        <p className="text-xs text-gray-400 mt-2">
                            Du findest deinen API Key unter wa.outrnk.io. Format: wapi_...
                        </p>
                    </div>

                    {/* Custom Resend Configuration */}
                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-900">E-Mail Absender (Resend)</h3>
                                <p className="text-sm text-gray-500">Verbinde deinen eigenen Resend-Account fur eigene Absender-Adresse</p>
                            </div>
                        </div>

                        {settings.resendApiKeySet ? (
                            <div className="space-y-3">
                                <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                        <div>
                                            <span className="text-sm font-medium text-green-700">Eigener Resend verbunden</span>
                                            <p className="text-xs text-green-600">Absender: {settings.resendFromEmail} • Key: {settings.resendApiKey}</p>
                                        </div>
                                    </div>
                                    <button onClick={handleRemoveResend} className="text-xs text-red-500 hover:text-red-700 font-medium">
                                        Entfernen
                                    </button>
                                </div>
                                <p className="text-xs text-gray-500">
                                    Alle E-Mails (an Leads und Mitarbeiter) werden uber deinen Resend-Account von <strong>{settings.resendFromEmail}</strong> gesendet.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                    <p className="text-sm text-blue-700 mb-1 font-medium">Standard-Absender aktiv</p>
                                    <p className="text-xs text-blue-600">E-Mails werden uber <strong>noreply@leadsignal.de</strong> gesendet. Verbinde deinen eigenen Resend-Account um E-Mails von deiner Domain zu senden.</p>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-500 block mb-1">Resend API Key</label>
                                    <input
                                        type="password"
                                        value={resendKeyInput}
                                        onChange={(e) => setResendKeyInput(e.target.value)}
                                        placeholder="re_..."
                                        className="w-full max-w-md px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#0052FF] focus:border-[#0052FF] outline-none font-mono text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-500 block mb-1">Absender E-Mail (verifizierte Domain in Resend)</label>
                                    <input
                                        type="email"
                                        value={resendEmailInput}
                                        onChange={(e) => setResendEmailInput(e.target.value)}
                                        placeholder="info@deine-firma.de"
                                        className="w-full max-w-md px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#0052FF] focus:border-[#0052FF] outline-none text-sm"
                                    />
                                </div>
                                <button
                                    onClick={handleSaveResend}
                                    disabled={!resendKeyInput || !resendEmailInput}
                                    className="px-4 py-2.5 bg-[#0052FF] text-white rounded-lg text-sm font-medium hover:bg-[#0047E1] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    Resend verbinden
                                </button>
                                <p className="text-xs text-gray-400">
                                    Du brauchst: 1) Resend-Account (resend.com) 2) Verifizierte Domain 3) API Key. Alle E-Mails an Leads UND Mitarbeiter gehen dann uber deinen Account.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Branding Presets */}
                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                                    <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900">Branding-Presets</h3>
                                    <p className="text-sm text-gray-500">Verschiedene Designs fur deine E-Mail Templates</p>
                                </div>
                            </div>
                            {!editingPreset && brandingPresets.length > 0 && (
                                <button
                                    onClick={() => setEditingPreset({ id: '', name: '', logo_url: null, company_name: null, primary_color: '#0052FF', footer_text: null, is_default: false })}
                                    className="px-3 py-1.5 bg-[#0052FF] text-white rounded-lg text-sm font-medium hover:bg-[#0047E1] transition-colors flex items-center gap-1"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                    Neues Preset
                                </button>
                            )}
                        </div>

                        {/* Preset Form */}
                        {(editingPreset || brandingPresets.length === 0) && (
                            <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-3">
                                <h4 className="text-sm font-medium text-gray-700">
                                    {editingPreset?.id ? 'Preset bearbeiten' : 'Neues Branding-Preset erstellen'}
                                </h4>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-medium text-gray-500 block mb-1">Name *</label>
                                        <input
                                            type="text"
                                            value={presetForm.name}
                                            onChange={e => setPresetForm({ ...presetForm, name: e.target.value })}
                                            placeholder="z.B. Firma A Branding"
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#0052FF] outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-gray-500 block mb-1">Firmenname</label>
                                        <input
                                            type="text"
                                            value={presetForm.companyName}
                                            onChange={e => setPresetForm({ ...presetForm, companyName: e.target.value })}
                                            placeholder="z.B. Meine Firma GmbH"
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#0052FF] outline-none"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-500 block mb-1">Logo-URL</label>
                                    <input
                                        type="url"
                                        value={presetForm.logoUrl}
                                        onChange={e => setPresetForm({ ...presetForm, logoUrl: e.target.value })}
                                        placeholder="https://..."
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#0052FF] outline-none font-mono"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-medium text-gray-500 block mb-1">Primare Farbe</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="color"
                                                value={presetForm.primaryColor}
                                                onChange={e => setPresetForm({ ...presetForm, primaryColor: e.target.value })}
                                                className="w-10 h-10 rounded border border-gray-200 cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={presetForm.primaryColor}
                                                onChange={e => setPresetForm({ ...presetForm, primaryColor: e.target.value })}
                                                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#0052FF] outline-none font-mono"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-gray-500 block mb-1">Footer-Text</label>
                                        <input
                                            type="text"
                                            value={presetForm.footerText}
                                            onChange={e => setPresetForm({ ...presetForm, footerText: e.target.value })}
                                            placeholder="z.B. © 2024 Meine Firma"
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#0052FF] outline-none"
                                        />
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="isDefault"
                                        checked={presetForm.isDefault}
                                        onChange={e => setPresetForm({ ...presetForm, isDefault: e.target.checked })}
                                        className="w-4 h-4 text-[#0052FF] border-gray-300 rounded focus:ring-[#0052FF]"
                                    />
                                    <label htmlFor="isDefault" className="text-sm text-gray-600">Als Standard-Preset verwenden</label>
                                </div>
                                <div className="flex gap-2 pt-2">
                                    <button
                                        onClick={handleSavePreset}
                                        disabled={savingPreset || !presetForm.name.trim()}
                                        className="px-4 py-2 bg-[#0052FF] text-white rounded-lg text-sm font-medium hover:bg-[#0047E1] disabled:opacity-50 transition-colors"
                                    >
                                        {savingPreset ? 'Speichert...' : editingPreset?.id ? 'Aktualisieren' : 'Erstellen'}
                                    </button>
                                    {editingPreset?.id && (
                                        <button
                                            onClick={handleCancelPresetEdit}
                                            className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                                        >
                                            Abbrechen
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Existing Presets List */}
                        {brandingPresets.length > 0 && (
                            <div className="space-y-2">
                                {brandingPresets.map(preset => (
                                    <div key={preset.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                                                style={{ backgroundColor: preset.primary_color }}
                                            >
                                                {preset.logo_url ? (
                                                    <img src={preset.logo_url} alt="" className="w-6 h-6 object-contain" />
                                                ) : (
                                                    preset.name.charAt(0).toUpperCase()
                                                )}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-gray-900 text-sm">{preset.name}</span>
                                                    {preset.is_default && (
                                                        <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-medium">Default</span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-gray-500">
                                                    {preset.company_name || 'Kein Firmenname'} • {preset.primary_color}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => handleEditPreset(preset)}
                                                className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700"
                                                title="Bearbeiten"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                            </button>
                                            <button
                                                onClick={() => handleDeletePreset(preset.id)}
                                                className="p-2 hover:bg-red-50 rounded-lg transition-colors text-gray-400 hover:text-red-600"
                                                title="Loschen"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {brandingPresets.length === 0 && !editingPreset && (
                            <div className="text-center py-6 text-gray-500 text-sm">
                                Noch keine Branding-Presets vorhanden.
                            </div>
                        )}
                    </div>

                    {/* Form Aliases */}
                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                                <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-900">Formular-Namen</h3>
                                <p className="text-sm text-gray-500">Eigene Namen fur deine Meta-Formulare vergeben</p>
                            </div>
                        </div>

                        {formAliases.length === 0 ? (
                            <div className="text-center py-8 text-gray-500 text-sm">
                                <p>Noch keine Formulare vorhanden.</p>
                                <p className="text-xs mt-1">Sobald Leads eingehen, erscheinen die Formulare hier.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {formAliases.map(form => (
                                    <div key={form.form_id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                                                    {form.form_id.slice(-8)}
                                                </span>
                                                <span className="text-sm text-gray-500">
                                                    {form.original_name}
                                                </span>
                                            </div>
                                            {editingAliasId === form.form_id ? (
                                                <div className="flex items-center gap-2 mt-2">
                                                    <input
                                                        type="text"
                                                        value={aliasInput}
                                                        onChange={e => setAliasInput(e.target.value)}
                                                        placeholder="Eigener Name, z.B. PKV"
                                                        className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#0052FF] outline-none"
                                                        autoFocus
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') handleSaveAlias(form.form_id, form.original_name);
                                                            if (e.key === 'Escape') handleCancelEditAlias();
                                                        }}
                                                    />
                                                    <button
                                                        onClick={() => handleSaveAlias(form.form_id, form.original_name)}
                                                        className="px-3 py-1.5 bg-[#0052FF] text-white rounded-lg text-sm font-medium hover:bg-[#0047E1] transition-colors"
                                                    >
                                                        Speichern
                                                    </button>
                                                    <button
                                                        onClick={handleCancelEditAlias}
                                                        className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                                                    >
                                                        Abbrechen
                                                    </button>
                                                </div>
                                            ) : form.display_name ? (
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-sm font-medium text-gray-900">→ {form.display_name}</span>
                                                    <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-medium">Angepasst</span>
                                                </div>
                                            ) : (
                                                <p className="text-xs text-gray-400 mt-1">Kein eigener Name vergeben</p>
                                            )}
                                        </div>
                                        {editingAliasId !== form.form_id && (
                                            <button
                                                onClick={() => handleStartEditAlias(form.form_id, form.display_name)}
                                                className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700"
                                                title="Namen bearbeiten"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                            <p className="text-xs text-orange-700">
                                <strong>Tipp:</strong> Eigene Namen werden uberall angezeigt - in der Lead-Liste, im Kanban-Board, in der Analytics und in den Automations.
                            </p>
                        </div>
                    </div>
                </div>
            )}
                </>
            )}

            {/* New Template Dialog */}
            {showNewDialog && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowNewDialog(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-gray-200">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-semibold text-gray-900">Neues Template erstellen</h2>
                                <button onClick={() => setShowNewDialog(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                                    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Blank Templates */}
                            <div>
                                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Leer erstellen</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <button onClick={() => handleCreateBlank('email')} className="p-4 border-2 border-dashed border-gray-200 rounded-xl hover:border-[#0052FF] hover:bg-[#0052FF]/5 transition-all text-left">
                                        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mb-2">
                                            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                        </div>
                                        <p className="font-medium text-gray-900 text-sm">Leere E-Mail</p>
                                        <p className="text-xs text-gray-500">Von Grund auf erstellen</p>
                                    </button>
                                    <button onClick={() => handleCreateBlank('whatsapp')} className="p-4 border-2 border-dashed border-gray-200 rounded-xl hover:border-green-500 hover:bg-green-50 transition-all text-left">
                                        <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center mb-2">
                                            <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                        </div>
                                        <p className="font-medium text-gray-900 text-sm">Leere WhatsApp</p>
                                        <p className="text-xs text-gray-500">Textnachricht erstellen</p>
                                    </button>
                                </div>
                            </div>

                            {/* Preset Templates */}
                            <div>
                                <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Vorlagen verwenden</h3>
                                <div className="space-y-2">
                                    {PRESET_TEMPLATES.map((preset, i) => (
                                        <button key={i} onClick={() => handleCreateFromPreset(preset)} className="w-full p-4 border border-gray-200 rounded-xl hover:border-[#0052FF] hover:bg-[#0052FF]/5 transition-all flex items-center gap-4 text-left">
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${preset.type === 'email' ? 'bg-blue-100' : 'bg-green-100'}`}>
                                                {preset.type === 'email' ? (
                                                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                                ) : (
                                                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                                )}
                                            </div>
                                            <div>
                                                <p className="font-medium text-gray-900 text-sm">{preset.name}</p>
                                                <p className="text-xs text-gray-500">{preset.type === 'email' ? 'E-Mail Vorlage' : 'WhatsApp Vorlage'}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ==========================================================================
// Template Editor Component
// ==========================================================================
function TemplateEditor({ template, forms, leadVariables, assigneeVariables, branding, brandingPresets, saving, onSave, onClose }: {
    template: Template;
    forms: FormOption[];
    leadVariables: { key: string; label: string }[];
    assigneeVariables: { key: string; label: string }[];
    branding: Branding;
    brandingPresets: BrandingPreset[];
    saving: boolean;
    onSave: (t: Template) => void;
    onClose: () => void;
}) {
    const [t, setT] = useState<Template>(template);
    const [showPreview, setShowPreview] = useState(false);

    // Get effective branding for preview (from preset or org branding)
    const selectedPreset = brandingPresets.find(p => p.id === t.branding_preset_id);
    const effectiveBranding: Branding = selectedPreset
        ? { companyName: selectedPreset.company_name, logoUrl: selectedPreset.logo_url, primaryColor: selectedPreset.primary_color }
        : branding;
    const footerText = selectedPreset?.footer_text || effectiveBranding.companyName || 'outrnk. Leads';

    // Parse content if string
    useEffect(() => {
        if (typeof t.content === 'string') {
            try { setT(prev => ({ ...prev, content: JSON.parse(prev.content as unknown as string) })); } catch { /* */ }
        }
    }, []);

    const blocks = (t.content as { blocks?: EmailBlock[] }).blocks || [];
    const waMessage = (t.content as { message?: string }).message || '';

    const updateBlocks = (newBlocks: EmailBlock[]) => {
        setT({ ...t, content: { blocks: newBlocks } });
    };

    const addBlock = (type: EmailBlock['type']) => {
        const newBlock: EmailBlock = { id: genId(), type };
        if (type === 'heading') newBlock.text = 'Uberschrift';
        if (type === 'text') newBlock.text = 'Text hier...';
        if (type === 'button') { newBlock.text = 'Klicken'; newBlock.url = 'https://'; }
        updateBlocks([...blocks, newBlock]);
    };

    const updateBlock = (id: string, updates: Partial<EmailBlock>) => {
        updateBlocks(blocks.map(b => b.id === id ? { ...b, ...updates } : b));
    };

    const removeBlock = (id: string) => {
        updateBlocks(blocks.filter(b => b.id !== id));
    };

    const moveBlock = (id: string, dir: -1 | 1) => {
        const idx = blocks.findIndex(b => b.id === id);
        if (idx < 0) return;
        const newIdx = idx + dir;
        if (newIdx < 0 || newIdx >= blocks.length) return;
        const newBlocks = [...blocks];
        [newBlocks[idx], newBlocks[newIdx]] = [newBlocks[newIdx], newBlocks[idx]];
        updateBlocks(newBlocks);
    };

    const insertVariable = (varKey: string, targetId?: string) => {
        if (t.type === 'whatsapp') {
            setT({ ...t, content: { message: waMessage + varKey } });
            return;
        }
        if (targetId) {
            const block = blocks.find(b => b.id === targetId);
            if (block) updateBlock(targetId, { text: (block.text || '') + varKey });
        }
    };

    return (
        <div className="space-y-6">
            {/* Editor Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
                        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <div>
                        <input
                            type="text"
                            value={t.name}
                            onChange={e => setT({ ...t, name: e.target.value })}
                            className="text-xl font-bold text-gray-900 bg-transparent border-none outline-none focus:ring-0 p-0"
                        />
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ml-2 ${t.type === 'email' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                            {t.type === 'email' ? 'E-Mail' : 'WhatsApp'}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setShowPreview(!showPreview)}
                        className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        Vorschau
                    </button>
                    <button onClick={() => onSave(t)} disabled={saving}
                        className="px-4 py-2 bg-[#0052FF] text-white rounded-lg text-sm font-medium hover:bg-[#0047E1] disabled:opacity-50 transition-colors">
                        {saving ? 'Speichert...' : 'Speichern'}
                    </button>
                </div>
            </div>

            <div className={`grid gap-6 ${showPreview ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {/* Editor Panel */}
                <div className="space-y-4">
                    {/* Template Settings */}
                    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                        <h3 className="font-medium text-gray-900 text-sm">Einstellungen</h3>

                        {/* Trigger */}
                        <div>
                            <label className="text-xs font-medium text-gray-500 block mb-1">Ausloser</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setT({ ...t, trigger: 'new_lead' })}
                                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                                        t.trigger !== 'lead_assigned'
                                            ? 'border-[#0052FF] bg-[#0052FF]/5'
                                            : 'border-gray-200 hover:border-gray-300'
                                    }`}
                                >
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className="w-5 h-5 rounded-full bg-orange-100 flex items-center justify-center">
                                            <svg className="w-3 h-3 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                        </span>
                                        <span className="text-sm font-medium text-gray-900">Bei Eingang</span>
                                    </div>
                                    <p className="text-[11px] text-gray-500 ml-7">Wenn ein Lead ins CRM kommt</p>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setT({ ...t, trigger: 'lead_assigned' })}
                                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                                        t.trigger === 'lead_assigned'
                                            ? 'border-[#0052FF] bg-[#0052FF]/5'
                                            : 'border-gray-200 hover:border-gray-300'
                                    }`}
                                >
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className="w-5 h-5 rounded-full bg-purple-100 flex items-center justify-center">
                                            <svg className="w-3 h-3 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                        </span>
                                        <span className="text-sm font-medium text-gray-900">Bei Zuweisung</span>
                                    </div>
                                    <p className="text-[11px] text-gray-500 ml-7">Wenn Lead zugewiesen wird</p>
                                </button>
                            </div>
                        </div>

                        {/* Form Assignment */}
                        <div>
                            <label className="text-xs font-medium text-gray-500 block mb-1">Formular</label>
                            <select
                                value={t.form_id || ''}
                                onChange={e => {
                                    const form = forms.find(f => f.form_id === e.target.value);
                                    setT({ ...t, form_id: e.target.value || null, form_name: form?.form_name || null });
                                }}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#0052FF] outline-none"
                            >
                                <option value="">Alle Formulare</option>
                                {forms.map(f => (
                                    <option key={f.form_id} value={f.form_id}>{f.form_name}</option>
                                ))}
                            </select>
                        </div>

                        {t.type === 'email' && (
                            <>
                                <div>
                                    <label className="text-xs font-medium text-gray-500 block mb-1">Betreff</label>
                                    <input type="text" value={t.subject || ''} onChange={e => setT({ ...t, subject: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#0052FF] outline-none"
                                        placeholder="z.B. Danke fur deine Anfrage, {{first_name}}!" />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-500 block mb-1">Absender-Name</label>
                                    <input type="text" value={t.sender_name || ''} onChange={e => setT({ ...t, sender_name: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#0052FF] outline-none"
                                        placeholder="z.B. Meine Firma" />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-gray-500 block mb-1">Branding-Preset</label>
                                    <select
                                        value={t.branding_preset_id || ''}
                                        onChange={e => setT({ ...t, branding_preset_id: e.target.value || null })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#0052FF] outline-none"
                                    >
                                        <option value="">Standard (Org-Branding)</option>
                                        {brandingPresets.map(p => (
                                            <option key={p.id} value={p.id}>
                                                {p.name}{p.is_default ? ' (Default)' : ''}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-[10px] text-gray-400 mt-1">
                                        Logo, Farbe & Footer fur diese E-Mail. Presets unter Einstellungen verwalten.
                                    </p>
                                </div>
                            </>
                        )}

                        {/* Active Toggle */}
                        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                            <span className="text-sm text-gray-700">Aktiv</span>
                            <button onClick={() => setT({ ...t, is_active: !t.is_active })}
                                className={`relative w-11 h-6 rounded-full transition-colors ${t.is_active ? 'bg-[#0052FF]' : 'bg-gray-300'}`}>
                                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${t.is_active ? 'translate-x-5' : ''}`} />
                            </button>
                        </div>
                    </div>

                    {/* Variables */}
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                        <h3 className="font-medium text-gray-900 text-sm mb-2">Variablen</h3>
                        <p className="text-[11px] text-gray-400 mb-2">Lead-Daten</p>
                        <div className="flex flex-wrap gap-1.5">
                            {leadVariables.map(v => (
                                <button key={v.key} onClick={() => insertVariable(v.key)}
                                    className="px-2 py-1 bg-gray-100 hover:bg-[#0052FF]/10 hover:text-[#0052FF] rounded text-xs font-mono transition-colors"
                                    title={v.label}>
                                    {v.key}
                                </button>
                            ))}
                        </div>
                        {t.trigger === 'lead_assigned' && (
                            <>
                                <p className="text-[11px] text-gray-400 mt-3 mb-2">Mitarbeiter-Daten</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {assigneeVariables.map(v => (
                                        <button key={v.key} onClick={() => insertVariable(v.key)}
                                            className="px-2 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded text-xs font-mono transition-colors"
                                            title={v.label}>
                                            {v.key}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Content Editor */}
                    {t.type === 'email' ? (
                        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                            <div className="flex items-center justify-between">
                                <h3 className="font-medium text-gray-900 text-sm">Inhalt</h3>
                                <div className="flex gap-1">
                                    {(['heading', 'text', 'button', 'divider'] as const).map(type => (
                                        <button key={type} onClick={() => addBlock(type)}
                                            className="px-2 py-1 text-xs bg-gray-100 hover:bg-[#0052FF]/10 hover:text-[#0052FF] rounded transition-colors"
                                            title={type === 'heading' ? 'Uberschrift' : type === 'text' ? 'Text' : type === 'button' ? 'Button' : 'Trennlinie'}>
                                            {type === 'heading' ? 'H' : type === 'text' ? 'T' : type === 'button' ? 'Btn' : '---'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {blocks.map((block, i) => (
                                <div key={block.id} className="border border-gray-200 rounded-lg p-3 group relative">
                                    {/* Block Controls */}
                                    <div className="absolute -top-2 right-2 hidden group-hover:flex items-center gap-0.5 bg-white border border-gray-200 rounded-md shadow-sm">
                                        <button onClick={() => moveBlock(block.id, -1)} disabled={i === 0} className="p-1 hover:bg-gray-100 rounded disabled:opacity-30">
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                                        </button>
                                        <button onClick={() => moveBlock(block.id, 1)} disabled={i === blocks.length - 1} className="p-1 hover:bg-gray-100 rounded disabled:opacity-30">
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                        </button>
                                        <button onClick={() => removeBlock(block.id)} className="p-1 hover:bg-red-50 hover:text-red-600 rounded">
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                    </div>

                                    <span className="text-[10px] text-gray-400 uppercase tracking-wider">
                                        {block.type === 'heading' ? 'Uberschrift' : block.type === 'text' ? 'Text' : block.type === 'button' ? 'Button' : 'Trennlinie'}
                                    </span>

                                    {block.type === 'heading' && (
                                        <input type="text" value={block.text || ''} onChange={e => updateBlock(block.id, { text: e.target.value })}
                                            className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm font-semibold focus:ring-2 focus:ring-[#0052FF] outline-none" />
                                    )}
                                    {block.type === 'text' && (
                                        <textarea value={block.text || ''} onChange={e => updateBlock(block.id, { text: e.target.value })} rows={3}
                                            className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm focus:ring-2 focus:ring-[#0052FF] outline-none resize-y" />
                                    )}
                                    {block.type === 'button' && (
                                        <div className="mt-1 space-y-1.5">
                                            <input type="text" value={block.text || ''} onChange={e => updateBlock(block.id, { text: e.target.value })} placeholder="Button Text"
                                                className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:ring-2 focus:ring-[#0052FF] outline-none" />
                                            <input type="url" value={block.url || ''} onChange={e => updateBlock(block.id, { url: e.target.value })} placeholder="https://..."
                                                className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm font-mono focus:ring-2 focus:ring-[#0052FF] outline-none" />
                                        </div>
                                    )}
                                    {block.type === 'divider' && (
                                        <hr className="mt-2 border-gray-200" />
                                    )}
                                </div>
                            ))}

                            {blocks.length === 0 && (
                                <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center text-gray-400 text-sm">
                                    Klicke oben auf H / T / Btn um Blocke hinzuzufugen
                                </div>
                            )}
                        </div>
                    ) : (
                        /* WhatsApp Editor */
                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                            <h3 className="font-medium text-gray-900 text-sm mb-2">Nachricht</h3>
                            <textarea
                                value={waMessage}
                                onChange={e => setT({ ...t, content: { message: e.target.value } })}
                                rows={8}
                                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#0052FF] outline-none resize-y"
                                placeholder="Hallo {{first_name}}! ..."
                            />
                        </div>
                    )}
                </div>

                {/* Preview Panel */}
                {showPreview && (
                    <div className="space-y-4">
                        <h3 className="font-medium text-gray-900 text-sm">Vorschau</h3>
                        {t.type === 'email' ? (
                            <div className="bg-gray-100 rounded-xl p-6">
                                <div className="bg-white rounded-xl shadow-sm border border-gray-200 max-w-[480px] mx-auto overflow-hidden">
                                    {/* Email Header */}
                                    <div className="p-5 border-b border-gray-200">
                                        {effectiveBranding.logoUrl ? (
                                            <img src={effectiveBranding.logoUrl} alt={effectiveBranding.companyName || 'Logo'} className="h-8 object-contain" />
                                        ) : (
                                            <span className="text-lg font-bold text-gray-900">
                                                {effectiveBranding.companyName || <>outrnk<span style={{ color: effectiveBranding.primaryColor || '#0052FF' }}>.</span></>}
                                            </span>
                                        )}
                                    </div>
                                    {/* Email Body */}
                                    <div className="p-5">
                                        {blocks.map(block => (
                                            <div key={block.id}>
                                                {block.type === 'heading' && (
                                                    <h2 className="text-lg font-semibold text-gray-900 mb-3">
                                                        {(block.text || '').replace(/\{\{first_name\}\}/g, 'Max').replace(/\{\{full_name\}\}/g, 'Max Mustermann').replace(/\{\{company_name\}\}/g, effectiveBranding.companyName || 'Firma').replace(/\{\{assignee_name\}\}/g, 'Anna Muller').replace(/\{\{assignee_email\}\}/g, 'anna@firma.de')}
                                                    </h2>
                                                )}
                                                {block.type === 'text' && (
                                                    <p className="text-sm text-gray-600 mb-3 whitespace-pre-line">
                                                        {(block.text || '').replace(/\{\{first_name\}\}/g, 'Max').replace(/\{\{full_name\}\}/g, 'Max Mustermann').replace(/\{\{company_name\}\}/g, effectiveBranding.companyName || 'Firma').replace(/\{\{assignee_name\}\}/g, 'Anna Muller').replace(/\{\{assignee_email\}\}/g, 'anna@firma.de')}
                                                    </p>
                                                )}
                                                {block.type === 'button' && (
                                                    <div className="mb-3">
                                                        <span className="inline-block px-5 py-2.5 text-white rounded-md text-sm font-medium" style={{ backgroundColor: effectiveBranding.primaryColor || '#0052FF' }}>
                                                            {block.text || 'Button'}
                                                        </span>
                                                    </div>
                                                )}
                                                {block.type === 'divider' && <hr className="border-gray-200 my-4" />}
                                            </div>
                                        ))}
                                    </div>
                                    {/* Email Footer */}
                                    <div className="p-4 bg-gray-50 border-t border-gray-200 text-center">
                                        <p className="text-xs text-gray-400">{footerText}</p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            /* WhatsApp Preview */
                            <div className="bg-[#e5ddd5] rounded-xl p-6" style={{ backgroundImage: 'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFklEQVQYV2P8z8BQz0BBwMgwqpBiEwcAMfkEAcQCiIQAAAAASUVORK5CYII=")' }}>
                                <div className="max-w-[320px] mx-auto">
                                    {/* WA Message Bubble */}
                                    <div className="bg-[#dcf8c6] rounded-lg rounded-tr-none p-3 shadow-sm relative">
                                        <p className="text-sm text-gray-800 whitespace-pre-line">
                                            {waMessage
                                                .replace(/\{\{first_name\}\}/g, 'Max')
                                                .replace(/\{\{full_name\}\}/g, 'Max Mustermann')
                                                .replace(/\{\{email\}\}/g, 'max@example.com')
                                                .replace(/\{\{phone\}\}/g, '+49 123 456789')
                                                .replace(/\{\{form_name\}\}/g, 'Kontaktformular')
                                                .replace(/\{\{company_name\}\}/g, effectiveBranding.companyName || 'Firma')
                                                .replace(/\{\{assignee_name\}\}/g, 'Anna Muller')
                                                .replace(/\{\{assignee_email\}\}/g, 'anna@firma.de')}
                                        </p>
                                        <div className="flex items-center justify-end gap-1 mt-1">
                                            <span className="text-[10px] text-gray-500">14:32</span>
                                            <svg className="w-3.5 h-3.5 text-blue-500" fill="currentColor" viewBox="0 0 24 24"><path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z"/></svg>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
