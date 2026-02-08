import React, { useState } from 'react';
import { Key, Webhook, Save, Shield, Trash2, Plus } from 'lucide-react';

interface Token {
  id: string;
  name: string;
  preview: string;
  created: string;
  role: 'READ' | 'ADMIN';
}

export const SettingsPanel: React.FC = () => {
  const [discordWebhook, setDiscordWebhook] = useState('https://discord.com/api/webhooks/1234...');
  const [tokens, setTokens] = useState<Token[]>([
    { id: '1', name: 'Dashboard Frontend', preview: 'gex_live_83...', created: '2023-10-15', role: 'READ' },
    { id: '2', name: 'Admin Script', preview: 'gex_adm_9a...', created: '2023-11-02', role: 'ADMIN' },
  ]);

  const handleCreateToken = () => {
    const newToken: Token = {
      id: Math.random().toString(36).substr(2, 9),
      name: 'New Service',
      preview: `gex_svc_${Math.random().toString(36).substr(2, 6)}...`,
      created: new Date().toISOString().split('T')[0],
      role: 'READ'
    };
    setTokens([...tokens, newToken]);
  };

  const deleteToken = (id: string) => {
    setTokens(tokens.filter(t => t.id !== id));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      
      {/* Discord Integration */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-indigo-500/10 p-2 rounded-lg text-indigo-400">
            <Webhook size={24} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-100">Discord Integration</h2>
            <p className="text-sm text-gray-500">Configure webhook alerts for significant GEX shifts.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Webhook URL</label>
            <div className="flex gap-2">
              <input 
                type="text" 
                value={discordWebhook}
                onChange={(e) => setDiscordWebhook(e.target.value)}
                className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-4 py-2 text-gray-300 focus:outline-none focus:border-indigo-500 transition-colors font-mono text-sm"
              />
              <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors">
                <Save size={18} /> Save
              </button>
            </div>
          </div>
          
          <div className="flex gap-4 pt-2">
             <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
               <input type="checkbox" defaultChecked className="rounded border-gray-700 bg-gray-800 text-indigo-500 focus:ring-offset-gray-900" />
               Alert on Zero Gamma Flip
             </label>
             <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
               <input type="checkbox" defaultChecked className="rounded border-gray-700 bg-gray-800 text-indigo-500 focus:ring-offset-gray-900" />
               Daily Summary
             </label>
          </div>
        </div>
      </section>

      {/* API Tokens */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500/10 p-2 rounded-lg text-emerald-400">
              <Key size={24} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-100">Access Tokens</h2>
              <p className="text-sm text-gray-500">Manage API keys for RBAC authentication.</p>
            </div>
          </div>
          <button 
            onClick={handleCreateToken}
            className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm border border-gray-700 transition-all"
          >
            <Plus size={16} /> Generate Token
          </button>
        </div>

        <div className="overflow-hidden rounded-lg border border-gray-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-950 text-gray-400">
              <tr>
                <th className="px-6 py-3 font-medium">Name</th>
                <th className="px-6 py-3 font-medium">Token Preview</th>
                <th className="px-6 py-3 font-medium">Role</th>
                <th className="px-6 py-3 font-medium">Created</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 bg-gray-900/50">
              {tokens.map((token) => (
                <tr key={token.id} className="hover:bg-gray-800/50 transition-colors">
                  <td className="px-6 py-4 text-gray-200 font-medium">{token.name}</td>
                  <td className="px-6 py-4 font-mono text-gray-400">{token.preview}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium border ${
                      token.role === 'ADMIN' 
                        ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' 
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    }`}>
                      {token.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-500">{token.created}</td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => deleteToken(token.id)}
                      className="text-gray-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Security Info */}
      <section className="bg-blue-900/10 border border-blue-900/30 rounded-xl p-6 flex items-start gap-4">
         <Shield className="text-blue-400 mt-1" size={24} />
         <div>
           <h3 className="text-blue-400 font-medium mb-1">Security Note</h3>
           <p className="text-sm text-blue-200/70 leading-relaxed">
             This environment uses token-based authentication. Ensure your <code>api_tokens</code> table in PostgreSQL is backed up. 
             Tokens generated here are hashed before storage. Rolling a token immediately invalidates the old one across all Oracle Cloud instances.
           </p>
         </div>
      </section>

    </div>
  );
};