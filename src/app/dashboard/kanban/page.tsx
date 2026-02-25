'use client';

import { useState, useEffect } from 'react';
import LeadDetailModal from '@/components/LeadDetailModal';

interface Lead {
    id: string;
    email: string;
    phone: string;
    full_name: string;
    status: string;
    quality_status: string;
    quality_feedback_sent: boolean;
    capi_sent_stages: string[];
    created_at: string;
    notes: string;
    assigned_to: string | null;
    assigned_name?: string;
    form_name: string | null;
    raw_data?: Record<string, unknown>;
}

interface TeamMember {
    id: string;
    first_name: string;
    last_name: string;
    full_name?: string;
    email: string;
}

interface FormOption {
    form_id: string;
    form_name: string;
}

const COLUMNS = [
    { id: 'new', title: 'Neu', color: 'bg-amber-500', textColor: 'text-amber-700', bgLight: 'bg-amber-50', sendsCAPI: false },
    { id: 'contacted', title: 'Kontaktiert', color: 'bg-blue-500', textColor: 'text-blue-700', bgLight: 'bg-blue-50', sendsCAPI: false },
    { id: 'interested', title: 'Interessiert', color: 'bg-purple-500', textColor: 'text-purple-700', bgLight: 'bg-purple-50', sendsCAPI: true },
    { id: 'meeting', title: 'Termin', color: 'bg-indigo-500', textColor: 'text-indigo-700', bgLight: 'bg-indigo-50', sendsCAPI: true },
    { id: 'won', title: 'Gewonnen', color: 'bg-green-500', textColor: 'text-green-700', bgLight: 'bg-green-50', sendsCAPI: true },
    { id: 'lost', title: 'Verloren', color: 'bg-red-500', textColor: 'text-red-700', bgLight: 'bg-red-50', sendsCAPI: true },
];

export default function KanbanPage() {
    const [leads, setLeads] = useState<Lead[]>([]);
    const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
    const [forms, setForms] = useState<FormOption[]>([]);
    const [formFilter, setFormFilter] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
    const [dragging, setDragging] = useState<string | null>(null);

    useEffect(() => {
        fetchData();
    }, [formFilter]);

    const fetchData = async () => {
        await Promise.all([fetchLeads(), fetchTeam()]);
        setLoading(false);
    };

    const fetchLeads = async () => {
        try {
            let url = '/api/leads?limit=10000';
            if (formFilter) {
                url += `&form_id=${formFilter}`;
            }
            const res = await fetch(url);
            const data = await res.json();
            setLeads(data.leads || []);
            setForms(data.forms || []);
        } catch (error) {
            console.error('Error fetching leads:', error);
        }
    };

    const fetchTeam = async () => {
        try {
            const res = await fetch('/api/team');
            const data = await res.json();
            setTeamMembers(data.members || []);
        } catch (error) {
            console.error('Error fetching team:', error);
        }
    };

    const updateLeadStatus = async (leadId: string, status: string) => {
        // Optimistic update
        const previousLeads = leads;
        setLeads(leads.map(l => l.id === leadId ? { ...l, status } : l));

        try {
            const res = await fetch(`/api/leads/${leadId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });
            if (!res.ok) {
                setLeads(previousLeads);
            }
        } catch (error) {
            console.error('Error updating lead:', error);
            setLeads(previousLeads);
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

    const getMemberName = (memberId: string | null) => {
        if (!memberId) return null;
        const member = teamMembers.find(m => m.id === memberId);
        return member ? `${member.first_name} ${member.last_name}` : null;
    };

    // Stats
    const totalLeads = leads.length;
    const qualifiedLeads = leads.filter(l => l.status === 'won' || l.status === 'interested' || l.status === 'meeting').length;
    const lostLeads = leads.filter(l => l.status === 'lost').length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Pipeline</h1>
                    <p className="text-gray-500 text-sm mt-1">Ziehe Leads durch die Pipeline - qualifizierte Leads trainieren Meta</p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Form Filter */}
                    <select
                        value={formFilter}
                        onChange={(e) => setFormFilter(e.target.value)}
                        className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#0052FF] focus:border-[#0052FF] outline-none bg-white"
                    >
                        <option value="">Alle Formulare</option>
                        {forms.map((form) => (
                            <option key={form.form_id} value={form.form_id}>
                                {form.form_name}
                            </option>
                        ))}
                    </select>
                    <button
                        onClick={() => fetchData()}
                        className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Aktualisieren
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-[#0052FF]/10 flex items-center justify-center">
                            <svg className="w-5 h-5 text-[#0052FF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Leads in Pipeline</p>
                            <p className="text-2xl font-bold text-gray-900">{totalLeads}</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
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
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Verloren</p>
                            <p className="text-2xl font-bold text-red-600">{lostLeads}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Kanban Board */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="w-8 h-8 border-4 border-[#0052FF] border-t-transparent rounded-full animate-spin"></div>
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
                                            {column.sendsCAPI && (
                                                <span className="text-xs text-green-600" title="Sendet Signal an Meta">
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                    </svg>
                                                </span>
                                            )}
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
                                                <div className="text-[10px] font-medium text-[#0052FF] bg-[#0052FF]/10 px-1.5 py-0.5 rounded inline-block mb-1.5">
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
                                            {lead.assigned_to && (
                                                <div className="mt-2 flex items-center gap-1">
                                                    <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center text-white text-[8px]">
                                                        {getMemberName(lead.assigned_to)?.charAt(0) || '?'}
                                                    </div>
                                                    <span className="text-xs text-blue-600 truncate">{getMemberName(lead.assigned_to)}</span>
                                                </div>
                                            )}
                                            {lead.notes && (
                                                <div className="mt-2 text-xs text-gray-600 bg-amber-50 border border-amber-100 rounded p-1.5 line-clamp-2">
                                                    {lead.notes}
                                                </div>
                                            )}
                                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200">
                                                <span className="text-xs text-gray-400">{formatDate(lead.created_at)}</span>
                                                {lead.capi_sent_stages && lead.capi_sent_stages.length > 0 && (
                                                    <span className="text-xs text-green-600 flex items-center gap-0.5" title={lead.capi_sent_stages.join(', ')}>
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                        </svg>
                                                        {lead.capi_sent_stages.length}x
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

            {/* Lead Detail Modal */}
            {selectedLead && (
                <LeadDetailModal
                    lead={selectedLead}
                    teamMembers={teamMembers}
                    onClose={() => setSelectedLead(null)}
                    onUpdate={() => { fetchLeads(); setSelectedLead(null); }}
                />
            )}
        </div>
    );
}

