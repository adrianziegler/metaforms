'use client';

import { useState, useEffect, use } from 'react';
import { toast, Toaster } from 'sonner';
import OnboardingTutorial from '@/components/OnboardingTutorial';

interface Lead {
    id: string;
    full_name: string;
    email: string;
    phone: string;
    form_name: string;
    quality_status: string;
    status: string;
    notes: string;
    raw_data: Record<string, unknown>;
    created_at: string;
    assigned_at: string;
}

interface TeamMember {
    firstName: string;
    lastName: string;
}

interface Branding {
    companyName: string | null;
    logoUrl: string | null;
    primaryColor: string | null;
}

const COLUMNS = [
    { id: 'new', title: 'Neu', color: 'bg-amber-500', textColor: 'text-amber-700', bgLight: 'bg-amber-50' },
    { id: 'contacted', title: 'Kontaktiert', color: 'bg-blue-500', textColor: 'text-blue-700', bgLight: 'bg-blue-50' },
    { id: 'interested', title: 'Interessiert', color: 'bg-purple-500', textColor: 'text-purple-700', bgLight: 'bg-purple-50' },
    { id: 'meeting', title: 'Termin', color: 'bg-indigo-500', textColor: 'text-indigo-700', bgLight: 'bg-indigo-50' },
    { id: 'won', title: 'Gewonnen', color: 'bg-green-500', textColor: 'text-green-700', bgLight: 'bg-green-50' },
    { id: 'lost', title: 'Verloren', color: 'bg-red-500', textColor: 'text-red-700', bgLight: 'bg-red-50' },
];

export default function PortalPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = use(params);
    const [leads, setLeads] = useState<Lead[]>([]);
    const [teamMember, setTeamMember] = useState<TeamMember | null>(null);
    const [branding, setBranding] = useState<Branding | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
    const [dragging, setDragging] = useState<string | null>(null);

    // Get primary color from branding or default
    const primaryColor = branding?.primaryColor || '#0052FF';

    useEffect(() => {
        fetchLeads();
    }, [token]);

    const fetchLeads = async () => {
        try {
            const res = await fetch(`/api/portal/leads?token=${token}`);
            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Ungultiger oder abgelaufener Link');
                setLoading(false);
                return;
            }

            setTeamMember(data.teamMember);
            setLeads(data.leads || []);
            setBranding(data.branding || null);
        } catch (err) {
            console.error('Error fetching leads:', err);
            setError('Fehler beim Laden');
        }
        setLoading(false);
    };

    const updateLeadStatus = async (leadId: string, status: string) => {
        // Optimistic update
        const previousLeads = leads;
        setLeads(leads.map(l => l.id === leadId ? { ...l, status } : l));

        try {
            const res = await fetch(`/api/portal/leads/${leadId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ status }),
            });

            if (res.ok) {
                toast.success('Status aktualisiert');
            } else {
                setLeads(previousLeads);
                toast.error('Fehler beim Aktualisieren');
            }
        } catch (err) {
            console.error('Error updating lead:', err);
            setLeads(previousLeads);
            toast.error('Fehler beim Aktualisieren');
        }
    };

    const handleDragStart = (leadId: string) => {
        setDragging(leadId);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = (columnId: string) => {
        if (dragging) {
            updateLeadStatus(dragging, columnId);
            setDragging(null);
        }
    };

    const getLeadsByStatus = (status: string) => {
        return leads.filter((lead) => lead.status === status);
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
        });
    };

    // Calculate stats
    const totalLeads = leads.length;
    const qualifiedLeads = leads.filter(l => l.quality_status === 'qualified').length;
    const unqualifiedLeads = leads.filter(l => l.quality_status === 'unqualified').length;
    const pendingLeads = leads.filter(l => l.quality_status === 'pending').length;

    if (loading) {
        return (
            <div className="min-h-screen bg-[#F8F9FB] flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-[#0052FF] border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-gray-500">Ladt...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-[#F8F9FB] flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl p-8 text-center shadow-lg max-w-md border border-gray-200">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h1 className="text-xl font-bold text-gray-900 mb-2">Zugriff verweigert</h1>
                    <p className="text-gray-600 mb-4">{error}</p>
                    <p className="text-sm text-gray-400">
                        Bitte kontaktiere deinen Administrator fur einen neuen Link.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F8F9FB]">
            <Toaster position="top-center" richColors />

            {/* Header */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
                <div className="max-w-[1800px] mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            {/* Logo */}
                            <div className="flex items-center gap-1">
                                {branding?.logoUrl ? (
                                    <img
                                        src={branding.logoUrl}
                                        alt={branding.companyName || 'Logo'}
                                        className="h-8 max-w-[150px] object-contain"
                                    />
                                ) : (
                                    <>
                                        <span className="text-xl font-bold text-gray-900">
                                            {branding?.companyName || 'outrnk'}
                                        </span>
                                        <span className="text-xl font-bold" style={{ color: primaryColor }}>.</span>
                                    </>
                                )}
                            </div>
                            <div className="h-6 w-px bg-gray-200"></div>
                            <div>
                                <h1 className="text-lg font-semibold text-gray-900">Meine Leads</h1>
                                <p className="text-sm text-gray-500">
                                    Willkommen, {teamMember?.firstName} {teamMember?.lastName}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => fetchLeads()}
                            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Aktualisieren
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-[1800px] mx-auto p-6">
                {/* Stats */}
                <div className="grid grid-cols-4 gap-4 mb-6">
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                        <div className="flex items-center gap-3">
                            <div
                                className="w-10 h-10 rounded-lg flex items-center justify-center"
                                style={{ backgroundColor: `${primaryColor}15` }}
                            >
                                <svg className="w-5 h-5" style={{ color: primaryColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Zugewiesen</p>
                                <p className="text-2xl font-bold text-gray-900">{totalLeads}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Qualifiziert</p>
                                <p className="text-2xl font-bold text-green-600">{qualifiedLeads}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Nicht qualifiziert</p>
                                <p className="text-2xl font-bold text-red-600">{unqualifiedLeads}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Zu bewerten</p>
                                <p className="text-2xl font-bold text-amber-600">{pendingLeads}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Info Banner */}
                <div
                    className="rounded-xl p-4 mb-6 flex items-center gap-3"
                    style={{ backgroundColor: `${primaryColor}08`, border: `1px solid ${primaryColor}15` }}
                >
                    <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${primaryColor}15` }}
                    >
                        <svg className="w-4 h-4" style={{ color: primaryColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <p className="text-sm text-gray-700">
                        <strong>Tipp:</strong> Ziehe Leads zwischen Spalten um den Status zu andern. Klicke auf einen Lead fur Details und Bewertung.
                    </p>
                </div>

                {/* Kanban Board */}
                {leads.length === 0 ? (
                    <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                            </svg>
                        </div>
                        <h2 className="text-lg font-semibold text-gray-900 mb-2">Noch keine Leads</h2>
                        <p className="text-gray-500">Sobald dir Leads zugewiesen werden, erscheinen sie hier.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-6 gap-4 min-h-[600px]">
                        {COLUMNS.map((column) => {
                            const columnLeads = getLeadsByStatus(column.id);
                            return (
                                <div
                                    key={column.id}
                                    className="bg-white rounded-xl border border-gray-200 flex flex-col"
                                    onDragOver={handleDragOver}
                                    onDrop={() => handleDrop(column.id)}
                                >
                                    {/* Column Header */}
                                    <div className="p-3 border-b border-gray-100">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2 h-2 rounded-full ${column.color}`}></div>
                                                <h2 className="font-semibold text-gray-900 text-sm">{column.title}</h2>
                                            </div>
                                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${column.bgLight} ${column.textColor}`}>
                                                {columnLeads.length}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Column Content */}
                                    <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                                        {columnLeads.map((lead) => (
                                            <div
                                                key={lead.id}
                                                draggable
                                                onDragStart={() => handleDragStart(lead.id)}
                                                onClick={() => setSelectedLead(lead)}
                                                className={`bg-gray-50 hover:bg-gray-100 rounded-lg p-3 cursor-pointer transition-all border border-transparent hover:border-gray-200 hover:shadow-sm ${dragging === lead.id ? 'opacity-50 scale-95' : ''}`}
                                            >
                                                {/* Form Name Tag */}
                                                {lead.form_name && (
                                                    <div
                                                        className="text-[10px] font-medium px-1.5 py-0.5 rounded inline-block mb-1.5"
                                                        style={{ color: primaryColor, backgroundColor: `${primaryColor}15` }}
                                                    >
                                                        {lead.form_name}
                                                    </div>
                                                )}
                                                <div className="font-medium text-gray-900 text-sm mb-1">
                                                    {lead.full_name || lead.email || 'Unbekannt'}
                                                </div>
                                                {lead.email && (
                                                    <div className="text-xs text-gray-500 truncate">{lead.email}</div>
                                                )}
                                                {lead.phone && (
                                                    <div className="text-xs text-gray-500">{lead.phone}</div>
                                                )}
                                                {lead.notes && (
                                                    <div className="mt-2 text-xs text-gray-600 bg-amber-50 border border-amber-100 rounded p-1.5 line-clamp-2">
                                                        {lead.notes}
                                                    </div>
                                                )}
                                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200">
                                                    <span className="text-xs text-gray-400">{formatDate(lead.created_at)}</span>
                                                    {lead.quality_status !== 'pending' && (
                                                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${lead.quality_status === 'qualified' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                            {lead.quality_status === 'qualified' ? 'Gut' : 'Schlecht'}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}

                                        {columnLeads.length === 0 && (
                                            <div className="text-center py-8 text-gray-400 text-xs border-2 border-dashed border-gray-200 rounded-lg">
                                                Leads hierher ziehen
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>

            {/* Lead Detail Modal */}
            {selectedLead && (
                <LeadDetailModal
                    lead={selectedLead}
                    token={token}
                    primaryColor={primaryColor}
                    onClose={() => setSelectedLead(null)}
                    onUpdate={(updatedLead) => {
                        setLeads(leads.map(l => l.id === updatedLead.id ? updatedLead : l));
                        setSelectedLead(null);
                    }}
                />
            )}

            {/* Onboarding Tutorial */}
            <OnboardingTutorial
                storageKey={`portal_onboarding_${token}`}
                primaryColor={primaryColor}
                welcomeTitle="Willkommen im Lead-Portal!"
                welcomeSubtitle="Hier verwaltest du deine zugewiesenen Leads. Wir zeigen dir kurz, wie alles funktioniert."
                steps={[
                    {
                        icon: (
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                            </svg>
                        ),
                        title: 'Dein Kanban-Board',
                        description: 'Deine Leads sind in Spalten nach Status sortiert: Neu, Kontaktiert, Interessiert, Termin, Gewonnen und Verloren. So siehst du auf einen Blick, wo jeder Lead steht.',
                        tip: 'Die Zahlen oben zeigen dir eine schnelle Ubersicht uber zugewiesene, qualifizierte und zu bewertende Leads.',
                    },
                    {
                        icon: (
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                            </svg>
                        ),
                        title: 'Drag & Drop',
                        description: 'Ziehe einen Lead einfach von einer Spalte in eine andere, um seinen Status zu andern. Zum Beispiel von "Neu" zu "Kontaktiert", wenn du den Lead angerufen hast.',
                        tip: 'Der Status wird sofort gespeichert, du musst nichts extra bestatigen.',
                    },
                    {
                        icon: (
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                        ),
                        title: 'Lead-Details',
                        description: 'Klicke auf einen Lead, um alle Details zu sehen: Kontaktdaten, Formular-Antworten, Status und Qualitats-Bewertung. Du kannst auch Notizen hinzufugen.',
                        tip: 'Bewerte die Lead-Qualitat mit Daumen hoch/runter, damit die Lead-Qualitat verbessert werden kann.',
                    },
                    {
                        icon: (
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        ),
                        title: 'Aktivitaten erfassen',
                        description: 'Im Tab "Aktivitaten" kannst du Anrufe, E-Mails, Meetings und Notizen fur jeden Lead dokumentieren. So hast du die komplette Kommunikationshistorie an einem Ort.',
                        tip: 'Wahle den Aktivitatstyp, gib einen Titel und optional eine Beschreibung ein, und setze das Datum.',
                    },
                ]}
            />
        </div>
    );
}

interface Activity {
    id: string;
    activity_type: string;
    title: string;
    description: string | null;
    activity_date: string;
    created_at: string;
    created_by_type: string;
}

const ACTIVITY_TYPES = [
    { id: 'call', label: 'Anruf' },
    { id: 'email', label: 'E-Mail' },
    { id: 'meeting', label: 'Meeting' },
    { id: 'note', label: 'Notiz' },
];

const STATUS_OPTIONS = [
    { id: 'new', label: 'Neu', color: '#F59E0B', bg: '#FEF3C7' },
    { id: 'contacted', label: 'Kontaktiert', color: '#3B82F6', bg: '#DBEAFE' },
    { id: 'interested', label: 'Interessiert', color: '#8B5CF6', bg: '#EDE9FE' },
    { id: 'meeting', label: 'Termin', color: '#6366F1', bg: '#E0E7FF' },
    { id: 'won', label: 'Gewonnen', color: '#10B981', bg: '#D1FAE5' },
    { id: 'lost', label: 'Verloren', color: '#EF4444', bg: '#FEE2E2' },
];

function getActivityIcon(type: string) {
    switch (type) {
        case 'call':
            return (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
            );
        case 'email':
            return (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
            );
        case 'meeting':
            return (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
            );
        case 'note':
            return (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
            );
        default:
            return (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            );
    }
}

function getActivityColor(type: string) {
    switch (type) {
        case 'call': return { text: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' };
        case 'email': return { text: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' };
        case 'meeting': return { text: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200' };
        case 'note': return { text: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200' };
        default: return { text: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200' };
    }
}

function LeadDetailModal({
    lead,
    token,
    primaryColor,
    onClose,
    onUpdate
}: {
    lead: Lead;
    token: string;
    primaryColor: string;
    onClose: () => void;
    onUpdate: (lead: Lead) => void;
}) {
    const [activeTab, setActiveTab] = useState<'details' | 'activities'>('details');
    const [notes, setNotes] = useState(lead.notes || '');
    const [qualityStatus, setQualityStatus] = useState(lead.quality_status);
    const [status, setStatus] = useState(lead.status);
    const [saving, setSaving] = useState(false);

    // Activities state
    const [activities, setActivities] = useState<Activity[]>([]);
    const [loadingActivities, setLoadingActivities] = useState(false);
    const [showAddActivity, setShowAddActivity] = useState(false);
    const [newActivity, setNewActivity] = useState({
        type: 'call',
        title: '',
        description: '',
        date: new Date().toISOString().slice(0, 16),
    });
    const [savingActivity, setSavingActivity] = useState(false);

    const currentStatus = STATUS_OPTIONS.find(s => s.id === status) || STATUS_OPTIONS[0];

    useEffect(() => {
        if (activeTab === 'activities' && activities.length === 0) {
            fetchActivities();
        }
    }, [activeTab]);

    const fetchActivities = async () => {
        setLoadingActivities(true);
        try {
            const res = await fetch(`/api/portal/leads/${lead.id}/activities`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            const data = await res.json();
            setActivities(data.activities || []);
        } catch (error) {
            console.error('Error fetching activities:', error);
        }
        setLoadingActivities(false);
    };

    const handleAddActivity = async () => {
        if (!newActivity.title.trim()) return;
        setSavingActivity(true);
        try {
            const res = await fetch(`/api/portal/leads/${lead.id}/activities`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    activityType: newActivity.type,
                    title: newActivity.title,
                    description: newActivity.description || null,
                    activityDate: newActivity.date ? new Date(newActivity.date).toISOString() : null,
                }),
            });
            if (res.ok) {
                setNewActivity({ type: 'call', title: '', description: '', date: new Date().toISOString().slice(0, 16) });
                setShowAddActivity(false);
                await fetchActivities();
            }
        } catch (error) {
            console.error('Error adding activity:', error);
        }
        setSavingActivity(false);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch(`/api/portal/leads/${lead.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ notes, qualityStatus, status }),
            });

            if (res.ok) {
                toast.success('Gespeichert');
                onUpdate({ ...lead, notes, quality_status: qualityStatus, status });
            } else {
                toast.error('Fehler beim Speichern');
            }
        } catch (err) {
            console.error('Error saving:', err);
            toast.error('Fehler beim Speichern');
        }
        setSaving(false);
    };

    // Parse raw_data defensively (may arrive as string or object)
    let parsedRawData: Record<string, unknown> = {};
    if (lead.raw_data) {
        if (typeof lead.raw_data === 'string') {
            try { parsedRawData = JSON.parse(lead.raw_data as string); } catch { parsedRawData = {}; }
        } else {
            parsedRawData = lead.raw_data;
        }
    }
    const STANDARD_FIELDS = ['email', 'phone', 'phone_number', 'full_name', 'first_name', 'last_name',
        'name', 'Name', 'Email', 'E-Mail', 'E-Mail-Adresse', 'e-mail', 'e-mail-adresse',
        'Telefonnummer', 'telefonnummer', 'Telefon', 'Handy', 'Handynummer',
        'Vollständiger Name', 'vollständiger name', 'Vorname', 'Nachname'];
    const additionalFields = Object.entries(parsedRawData)
        .filter(([key]) => !STANDARD_FIELDS.includes(key))
        .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
        .map(([key, value]) => ({ key, value: String(value) }));

    const formatActivityDate = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Gerade eben';
        if (diffMins < 60) return `vor ${diffMins} Min.`;
        if (diffHours < 24) return `vor ${diffHours} Std.`;
        if (diffDays < 7) return `vor ${diffDays} Tagen`;
        return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="border-b border-gray-100 px-6 py-5">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4">
                            <div
                                className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
                                style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}CC)` }}
                            >
                                {lead.full_name?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                            <div>
                                <div className="flex items-center gap-3">
                                    <h2 className="text-lg font-bold text-gray-900">{lead.full_name || 'Unbekannt'}</h2>
                                    <span
                                        className="text-xs font-semibold px-2.5 py-1 rounded-full"
                                        style={{ color: currentStatus.color, backgroundColor: currentStatus.bg }}
                                    >
                                        {currentStatus.label}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 mt-1">
                                    {lead.form_name && (
                                        <span
                                            className="text-xs font-medium px-2 py-0.5 rounded"
                                            style={{ color: primaryColor, backgroundColor: `${primaryColor}12` }}
                                        >
                                            {lead.form_name}
                                        </span>
                                    )}
                                    <span className="text-xs text-gray-400">
                                        Zugewiesen: {new Date(lead.assigned_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors text-gray-400 hover:text-gray-600"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-1 mt-4 bg-gray-100 rounded-lg p-1">
                        <button
                            onClick={() => setActiveTab('details')}
                            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                                activeTab === 'details'
                                    ? 'bg-white text-gray-900 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            <span className="flex items-center justify-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                                Details
                            </span>
                        </button>
                        <button
                            onClick={() => setActiveTab('activities')}
                            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                                activeTab === 'activities'
                                    ? 'bg-white text-gray-900 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            <span className="flex items-center justify-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                Aktivitaten
                                {activities.length > 0 && (
                                    <span className="bg-gray-200 text-gray-600 text-xs px-1.5 py-0.5 rounded-full">
                                        {activities.length}
                                    </span>
                                )}
                            </span>
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto">
                    {activeTab === 'details' ? (
                        <div className="p-6 space-y-5">
                            {/* Contact Info */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                        </svg>
                                        <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">E-Mail</span>
                                    </div>
                                    {lead.email ? (
                                        <a href={`mailto:${lead.email}`} className="text-sm font-medium hover:underline break-all" style={{ color: primaryColor }}>
                                            {lead.email}
                                        </a>
                                    ) : (
                                        <span className="text-sm text-gray-300">-</span>
                                    )}
                                </div>
                                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                        </svg>
                                        <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Telefon</span>
                                    </div>
                                    {lead.phone ? (
                                        <a href={`tel:${lead.phone}`} className="text-sm font-medium hover:underline" style={{ color: primaryColor }}>
                                            {lead.phone}
                                        </a>
                                    ) : (
                                        <span className="text-sm text-gray-300">-</span>
                                    )}
                                </div>
                            </div>

                            {/* Additional Form Fields */}
                            {additionalFields.length > 0 && (
                                <div>
                                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Formular-Antworten</h3>
                                    <div className="bg-gray-50 rounded-xl border border-gray-100 divide-y divide-gray-100">
                                        {additionalFields.map(({ key, value }) => (
                                            <div key={key} className="flex items-start px-4 py-3">
                                                <span className="text-xs font-medium text-gray-500 w-2/5 pt-0.5 capitalize">{key.replace(/_/g, ' ').replace(/^question\s*(\d+)$/i, 'Frage $1')}</span>
                                                <span className="text-sm text-gray-900 w-3/5">{value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Status */}
                            <div>
                                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Status</h3>
                                <div className="flex flex-wrap gap-2">
                                    {STATUS_OPTIONS.map((s) => (
                                        <button
                                            key={s.id}
                                            onClick={() => setStatus(s.id)}
                                            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border"
                                            style={{
                                                color: status === s.id ? '#fff' : s.color,
                                                backgroundColor: status === s.id ? s.color : s.bg,
                                                borderColor: status === s.id ? s.color : 'transparent',
                                                boxShadow: status === s.id ? `0 2px 8px ${s.color}40` : 'none',
                                            }}
                                        >
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Quality Rating */}
                            <div>
                                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Lead-Qualitat bewerten</h3>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => setQualityStatus('qualified')}
                                        className={`py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 border ${qualityStatus === 'qualified'
                                            ? 'bg-green-500 text-white border-green-500 shadow-lg shadow-green-500/20'
                                            : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                                        }`}
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                                        </svg>
                                        Qualifiziert
                                    </button>
                                    <button
                                        onClick={() => setQualityStatus('unqualified')}
                                        className={`py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 border ${qualityStatus === 'unqualified'
                                            ? 'bg-red-500 text-white border-red-500 shadow-lg shadow-red-500/20'
                                            : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                                        }`}
                                    >
                                        <svg className="w-4 h-4 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                                        </svg>
                                        Unqualifiziert
                                    </button>
                                </div>
                                <p className="text-xs text-gray-400 mt-2 text-center">
                                    Deine Bewertung hilft dabei, die Lead-Qualitat zu verbessern.
                                </p>
                            </div>

                            {/* Notes */}
                            <div>
                                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Notizen</h3>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Notizen zum Lead..."
                                    className="w-full p-3 border border-gray-200 rounded-xl resize-none h-24 text-sm outline-none transition-all"
                                    onFocus={(e) => {
                                        e.target.style.borderColor = primaryColor;
                                        e.target.style.boxShadow = `0 0 0 2px ${primaryColor}30`;
                                    }}
                                    onBlur={(e) => {
                                        e.target.style.borderColor = '#e5e7eb';
                                        e.target.style.boxShadow = 'none';
                                    }}
                                />
                            </div>
                        </div>
                    ) : (
                        /* Activities Tab */
                        <div className="p-6">
                            {/* Add Activity Button */}
                            {!showAddActivity ? (
                                <button
                                    onClick={() => setShowAddActivity(true)}
                                    className="w-full mb-4 px-4 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
                                    style={{ '--hover-color': primaryColor } as React.CSSProperties}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                    </svg>
                                    Aktivitat hinzufugen
                                </button>
                            ) : (
                                <div className="mb-5 bg-gray-50 rounded-xl border border-gray-200 p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-sm font-semibold text-gray-900">Neue Aktivitat</h4>
                                        <button
                                            onClick={() => setShowAddActivity(false)}
                                            className="text-gray-400 hover:text-gray-600"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>

                                    <div className="flex gap-2 mb-3">
                                        {ACTIVITY_TYPES.map((type) => (
                                            <button
                                                key={type.id}
                                                onClick={() => setNewActivity({ ...newActivity, type: type.id })}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                                                style={{
                                                    backgroundColor: newActivity.type === type.id ? primaryColor : '#f3f4f6',
                                                    color: newActivity.type === type.id ? '#fff' : '#4b5563',
                                                    border: newActivity.type === type.id ? 'none' : '1px solid #e5e7eb',
                                                }}
                                            >
                                                {getActivityIcon(type.id)}
                                                {type.label}
                                            </button>
                                        ))}
                                    </div>

                                    <input
                                        type="text"
                                        value={newActivity.title}
                                        onChange={(e) => setNewActivity({ ...newActivity, title: e.target.value })}
                                        placeholder="z.B. Erstgesprach gefuhrt, Termin vereinbart..."
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mb-2 outline-none transition-all"
                                        onFocus={(e) => { e.target.style.borderColor = primaryColor; e.target.style.boxShadow = `0 0 0 2px ${primaryColor}30`; }}
                                        onBlur={(e) => { e.target.style.borderColor = '#e5e7eb'; e.target.style.boxShadow = 'none'; }}
                                    />

                                    <textarea
                                        value={newActivity.description}
                                        onChange={(e) => setNewActivity({ ...newActivity, description: e.target.value })}
                                        placeholder="Optionale Beschreibung..."
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mb-2 resize-none h-16 outline-none transition-all"
                                        onFocus={(e) => { e.target.style.borderColor = primaryColor; e.target.style.boxShadow = `0 0 0 2px ${primaryColor}30`; }}
                                        onBlur={(e) => { e.target.style.borderColor = '#e5e7eb'; e.target.style.boxShadow = 'none'; }}
                                    />

                                    <div className="flex items-center gap-2">
                                        <input
                                            type="datetime-local"
                                            value={newActivity.date}
                                            onChange={(e) => setNewActivity({ ...newActivity, date: e.target.value })}
                                            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none"
                                        />
                                        <button
                                            onClick={handleAddActivity}
                                            disabled={!newActivity.title.trim() || savingActivity}
                                            className="px-4 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                                            style={{ backgroundColor: primaryColor }}
                                        >
                                            {savingActivity ? 'Speichert...' : 'Hinzufugen'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Activities Timeline */}
                            {loadingActivities ? (
                                <div className="flex justify-center py-8">
                                    <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${primaryColor} transparent ${primaryColor} ${primaryColor}` }}></div>
                                </div>
                            ) : activities.length === 0 ? (
                                <div className="text-center py-12">
                                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                        <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                    <p className="text-sm text-gray-400">Noch keine Aktivitaten</p>
                                    <p className="text-xs text-gray-300 mt-1">Fugen Sie Anrufe, Meetings oder Notizen hinzu</p>
                                </div>
                            ) : (
                                <div className="relative">
                                    <div className="absolute left-[19px] top-2 bottom-2 w-px bg-gray-200"></div>
                                    <div className="space-y-4">
                                        {activities.map((activity) => {
                                            const colors = getActivityColor(activity.activity_type);
                                            return (
                                                <div key={activity.id} className="flex gap-3 relative">
                                                    <div className={`w-10 h-10 rounded-full ${colors.bg} border-2 ${colors.border} flex items-center justify-center flex-shrink-0 relative z-10 ${colors.text}`}>
                                                        {getActivityIcon(activity.activity_type)}
                                                    </div>
                                                    <div className="flex-1 min-w-0 pb-1">
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div>
                                                                <p className="text-sm font-medium text-gray-900">{activity.title}</p>
                                                                {activity.description && (
                                                                    <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap">{activity.description}</p>
                                                                )}
                                                            </div>
                                                            <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                                                                {formatActivityDate(activity.activity_date)}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}>
                                                                {ACTIVITY_TYPES.find(t => t.id === activity.activity_type)?.label || activity.activity_type}
                                                            </span>
                                                            <span className="text-[10px] text-gray-300">
                                                                {new Date(activity.activity_date).toLocaleDateString('de-DE', {
                                                                    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                                                                })}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t border-gray-100 px-6 py-4 bg-gray-50/50">
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
                        >
                            Schliessen
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex-1 px-4 py-2.5 text-white rounded-xl text-sm font-medium disabled:opacity-50 transition-colors"
                            style={{ backgroundColor: primaryColor }}
                        >
                            {saving ? 'Speichert...' : 'Speichern'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
