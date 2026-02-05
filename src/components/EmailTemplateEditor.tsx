'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';

type TemplateType = 'lead_assignment' | 'team_member_welcome';

interface TemplateTexts {
    subject: string;
    greeting: string;
    message: string;
    ctaText?: string;
    portalText?: string;
}

interface Branding {
    companyName: string | null;
    logoUrl: string | null;
    primaryColor: string | null;
}

const DEFAULT_TEXTS: Record<TemplateType, TemplateTexts> = {
    lead_assignment: {
        subject: 'Neuer Lead: {{lead_name}}',
        greeting: 'Hallo {{assignee_name}}!',
        message: 'Dir wurde ein neuer Lead zugewiesen. Kontaktiere den Lead zeitnah.',
        ctaText: 'Wie war das Gesprach? Bewerte den Lead mit den Buttons unten.',
        portalText: 'Alle deine Leads im Portal verwalten',
    },
    team_member_welcome: {
        subject: 'Willkommen im Team!',
        greeting: 'Hallo {{member_name}}!',
        message: 'Du wurdest als Team-Mitglied hinzugefugt. Ab jetzt kannst du Leads uber dein personliches Portal einsehen und verwalten.',
        portalText: 'Uber diesen Link erreichst du jederzeit deine zugewiesenen Leads. Speichere den Link in deinen Lesezeichen.',
    },
};

const TEMPLATE_INFO: Record<TemplateType, { label: string; description: string }> = {
    lead_assignment: {
        label: 'Lead-Zuweisung',
        description: 'Diese E-Mail geht an Mitarbeiter, wenn ihnen ein Lead zugewiesen wird.',
    },
    team_member_welcome: {
        label: 'Willkommens-E-Mail',
        description: 'Diese E-Mail geht an neue Team-Mitglieder mit ihrem Portal-Link.',
    },
};

export default function EmailTemplateEditor() {
    const [templateType, setTemplateType] = useState<TemplateType>('lead_assignment');
    const [texts, setTexts] = useState<TemplateTexts>(DEFAULT_TEXTS.lead_assignment);
    const [branding, setBranding] = useState<Branding>({ companyName: null, logoUrl: null, primaryColor: null });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isCustom, setIsCustom] = useState(false);

    useEffect(() => {
        fetchData();
    }, [templateType]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch branding
            const brandingRes = await fetch('/api/settings/branding');
            if (brandingRes.ok) {
                const brandingData = await brandingRes.json();
                setBranding({
                    companyName: brandingData.companyName || null,
                    logoUrl: brandingData.logoUrl || null,
                    primaryColor: brandingData.primaryColor || null,
                });
            }

            // Fetch existing template texts
            const res = await fetch(`/api/settings/email-template/simple?type=${templateType}`);
            if (res.ok) {
                const data = await res.json();
                if (data.texts) {
                    setTexts(data.texts);
                    setIsCustom(data.isCustom);
                } else {
                    setTexts(DEFAULT_TEXTS[templateType]);
                    setIsCustom(false);
                }
            } else {
                setTexts(DEFAULT_TEXTS[templateType]);
                setIsCustom(false);
            }
        } catch (error) {
            console.error('Error loading template:', error);
            setTexts(DEFAULT_TEXTS[templateType]);
        }
        setLoading(false);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch('/api/settings/email-template/simple', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: templateType, texts }),
            });

            if (res.ok) {
                toast.success('Template gespeichert');
                setIsCustom(true);
            } else {
                toast.error('Fehler beim Speichern');
            }
        } catch {
            toast.error('Fehler beim Speichern');
        }
        setSaving(false);
    };

    const handleReset = async () => {
        if (!confirm('Mochtest du das Template wirklich auf den Standard zurucksetzen?')) return;

        try {
            const res = await fetch(`/api/settings/email-template/simple?type=${templateType}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                setTexts(DEFAULT_TEXTS[templateType]);
                setIsCustom(false);
                toast.success('Template zuruckgesetzt');
            }
        } catch {
            toast.error('Fehler');
        }
    };

    const updateText = (key: keyof TemplateTexts, value: string) => {
        setTexts(prev => ({ ...prev, [key]: value }));
    };

    const primaryColor = branding.primaryColor || '#0052FF';
    const companyName = branding.companyName || 'outrnk. Leads';

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
            {/* Template Type Selector */}
            <div className="bg-gray-50 rounded-xl p-1 inline-flex gap-1">
                {(Object.keys(TEMPLATE_INFO) as TemplateType[]).map((type) => (
                    <button
                        key={type}
                        onClick={() => setTemplateType(type)}
                        className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                            templateType === type
                                ? 'bg-white text-gray-900 shadow-sm'
                                : 'text-gray-600 hover:text-gray-900'
                        }`}
                    >
                        <span className="flex items-center gap-2">
                            {type === 'lead_assignment' ? (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                            ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                </svg>
                            )}
                            {TEMPLATE_INFO[type].label}
                        </span>
                    </button>
                ))}
            </div>

            {/* Info */}
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 flex items-center gap-3">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-blue-700">{TEMPLATE_INFO[templateType].description}</p>
                {isCustom && (
                    <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded flex-shrink-0">
                        Angepasst
                    </span>
                )}
            </div>

            <div className="grid grid-cols-2 gap-6">
                {/* Left: Edit Fields */}
                <div className="space-y-4">
                    <h3 className="font-medium text-gray-900 flex items-center gap-2">
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Texte anpassen
                    </h3>

                    <div>
                        <label className="text-xs font-medium text-gray-500 block mb-1">Betreff</label>
                        <input
                            type="text"
                            value={texts.subject}
                            onChange={(e) => updateText('subject', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#0052FF] outline-none"
                        />
                        <p className="text-[10px] text-gray-400 mt-1">
                            Variablen: {templateType === 'lead_assignment' ? '{{lead_name}}, {{assignee_name}}' : '{{member_name}}'}
                        </p>
                    </div>

                    <div>
                        <label className="text-xs font-medium text-gray-500 block mb-1">Begrußung</label>
                        <input
                            type="text"
                            value={texts.greeting}
                            onChange={(e) => updateText('greeting', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#0052FF] outline-none"
                        />
                    </div>

                    <div>
                        <label className="text-xs font-medium text-gray-500 block mb-1">Nachricht</label>
                        <textarea
                            value={texts.message}
                            onChange={(e) => updateText('message', e.target.value)}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#0052FF] outline-none resize-none"
                        />
                    </div>

                    {templateType === 'lead_assignment' && (
                        <div>
                            <label className="text-xs font-medium text-gray-500 block mb-1">Text vor Bewertungs-Buttons</label>
                            <input
                                type="text"
                                value={texts.ctaText || ''}
                                onChange={(e) => updateText('ctaText', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#0052FF] outline-none"
                            />
                        </div>
                    )}

                    <div>
                        <label className="text-xs font-medium text-gray-500 block mb-1">Portal-Hinweis</label>
                        <textarea
                            value={texts.portalText || ''}
                            onChange={(e) => updateText('portalText', e.target.value)}
                            rows={2}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#0052FF] outline-none resize-none"
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                        <button
                            onClick={handleReset}
                            disabled={!isCustom}
                            className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Zurucksetzen
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-4 py-2 bg-[#0052FF] text-white rounded-lg text-sm font-medium hover:bg-[#0047E1] disabled:opacity-50 transition-colors"
                        >
                            {saving ? 'Speichert...' : 'Speichern'}
                        </button>
                    </div>
                </div>

                {/* Right: Preview */}
                <div className="space-y-3">
                    <h3 className="font-medium text-gray-900 flex items-center gap-2">
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        Vorschau
                    </h3>

                    <div className="bg-gray-100 rounded-xl p-4 overflow-hidden">
                        {/* Email Preview */}
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden text-xs">
                            {/* Header */}
                            <div className="p-4 border-b border-gray-200">
                                {branding.logoUrl ? (
                                    <img src={branding.logoUrl} alt="Logo" className="h-6 object-contain" />
                                ) : (
                                    <span className="text-base font-bold text-gray-900">
                                        {branding.companyName || <>outrnk<span style={{ color: primaryColor }}>.</span></>}
                                    </span>
                                )}
                            </div>

                            {/* Body */}
                            <div className="p-4 space-y-3">
                                {/* Badge */}
                                <span className="inline-block px-2 py-0.5 text-[10px] font-semibold rounded" style={{ backgroundColor: `${primaryColor}20`, color: primaryColor }}>
                                    {templateType === 'lead_assignment' ? 'NEUER LEAD' : 'WILLKOMMEN'}
                                </span>

                                {/* Greeting */}
                                <h2 className="text-sm font-semibold text-gray-900">
                                    {texts.greeting
                                        .replace('{{assignee_name}}', 'Max')
                                        .replace('{{member_name}}', 'Max')}
                                </h2>

                                {/* Message */}
                                <p className="text-gray-600 leading-relaxed">
                                    {texts.message}
                                </p>

                                {/* Lead Details (only for assignment) */}
                                {templateType === 'lead_assignment' && (
                                    <div className="bg-gray-50 rounded-lg p-3 space-y-2 border border-gray-200">
                                        <div className="flex justify-between">
                                            <span className="text-gray-400">Name</span>
                                            <span className="text-gray-900 font-medium">Erika Beispiel</span>
                                        </div>
                                        <div className="flex justify-between border-t border-gray-200 pt-2">
                                            <span className="text-gray-400">E-Mail</span>
                                            <span style={{ color: primaryColor }}>erika@beispiel.de</span>
                                        </div>
                                        <div className="flex justify-between border-t border-gray-200 pt-2">
                                            <span className="text-gray-400">Telefon</span>
                                            <span style={{ color: primaryColor }}>+49 123 456789</span>
                                        </div>
                                        <div className="flex justify-between border-t border-gray-200 pt-2">
                                            <span className="text-gray-400">Formular</span>
                                            <span className="text-gray-900 font-medium">Kontaktformular</span>
                                        </div>
                                    </div>
                                )}

                                {/* Rating Buttons (only for assignment) */}
                                {templateType === 'lead_assignment' && (
                                    <div className="space-y-2">
                                        <p className="text-gray-600">{texts.ctaText}</p>
                                        <div className="flex gap-2">
                                            <span className="flex-1 text-center py-2 rounded text-white text-[10px] font-medium" style={{ backgroundColor: primaryColor }}>
                                                Guter Lead
                                            </span>
                                            <span className="flex-1 text-center py-2 rounded bg-gray-100 text-gray-700 text-[10px] font-medium border border-gray-200">
                                                Schlechter Lead
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {/* Portal Box */}
                                <div className="rounded-lg p-3 border" style={{ backgroundColor: `${primaryColor}10`, borderColor: `${primaryColor}30` }}>
                                    <p className="font-medium text-[11px] mb-2" style={{ color: primaryColor }}>
                                        {templateType === 'lead_assignment' ? 'Dein Lead-Portal' : 'Dein personliches Portal'}
                                    </p>
                                    <p className="text-gray-600 mb-2">{texts.portalText}</p>
                                    <span className="inline-block px-3 py-1.5 text-white rounded text-[10px] font-medium" style={{ backgroundColor: primaryColor }}>
                                        Portal offnen
                                    </span>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="p-3 bg-gray-50 border-t border-gray-200 text-center">
                                <p className="text-[10px] text-gray-400">{companyName}</p>
                            </div>
                        </div>
                    </div>

                    <p className="text-[10px] text-gray-400 text-center">
                        Logo, Farben & Footer aus deinen Branding-Einstellungen
                    </p>
                </div>
            </div>
        </div>
    );
}
