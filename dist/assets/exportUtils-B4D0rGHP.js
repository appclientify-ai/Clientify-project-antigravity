const m=(e,o,t)=>{const r=e.join(",")+`
`+o.map(p=>p.map(b=>`"${String(b||"").replace(/"/g,'""')}"`).join(",")).join(`
`),l=new Blob([r],{type:"text/csv;charset=utf-8;"}),a=URL.createObjectURL(l),s=document.createElement("a");s.setAttribute("href",a),s.setAttribute("download",t),s.style.visibility="hidden",document.body.appendChild(s),s.click(),document.body.removeChild(s)},i=e=>String(e??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"),c=(e,o,t)=>{const r=window.open("","_blank");if(!r)return;const l=i(e),a=new Date,s=a.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}),p=a.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",hour12:!0}),b=n=>{const d=String(n??"").trim();return d==="Filed"?'<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:700;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;text-transform:uppercase;">Filed</span>':d==="Pending"?'<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:700;background:#fff1f2;color:#be123c;border:1px solid #fecdd3;text-transform:uppercase;">Pending</span>':d==="Challan"?'<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:700;background:#faf5ff;color:#7e22ce;border:1px solid #e9d5ff;text-transform:uppercase;">Challan</span>':/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(d)?`<span style="font-family:ui-monospace,Menlo,monospace;font-weight:600;color:#4338ca;">${i(d)}</span>`:i(d||"---")},g=`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>${l}</title>
        <style>
          @page { size: auto; margin: 10mm; }
          * { box-sizing: border-box; }
          body { 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; 
            padding: 16px; 
            color: #0f172a; 
            background: #ffffff; 
            margin: 0;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .header-bar { 
            display: flex; 
            justify-content: space-between; 
            align-items: flex-end; 
            padding-bottom: 12px; 
            border-bottom: 2px solid #0f172a; 
            margin-bottom: 16px; 
          }
          .brand { font-size: 11px; font-weight: 800; color: #4338ca; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px; }
          .header-title { font-size: 18px; font-weight: 800; color: #0f172a; margin: 0; text-transform: uppercase; letter-spacing: -0.01em; }
          .header-meta { font-size: 11px; font-weight: 600; color: #64748b; text-align: right; }
          table { width: 100%; border-collapse: collapse; margin-top: 6px; }
          thead { display: table-header-group; }
          th { 
            background-color: #f8fafc; 
            color: #334155; 
            font-size: 10px; 
            font-weight: 800; 
            text-transform: uppercase; 
            letter-spacing: 0.05em; 
            padding: 8px 10px; 
            border: 1px solid #cbd5e1; 
            text-align: left; 
          }
          td { 
            border: 1px solid #e2e8f0; 
            padding: 7px 10px; 
            font-size: 11px; 
            color: #1e293b; 
          }
          tr:nth-child(even) { background-color: #fbfcfd; }
          tr { page-break-inside: avoid; }
          .footer-bar { 
            margin-top: 16px; 
            padding-top: 8px; 
            border-top: 1px solid #e2e8f0; 
            display: flex; 
            justify-content: space-between; 
            font-size: 10px; 
            color: #94a3b8; 
            font-weight: 500; 
          }
        </style>
      </head>
      <body>
        <div class="header-bar">
          <div>
            <div class="brand">Clientify Tax Suite</div>
            <h2 class="header-title">${l}</h2>
          </div>
          <div class="header-meta">
            <div><strong>${t.length}</strong> Records</div>
            <div>Printed: ${s}, ${p}</div>
          </div>
        </div>
        <table>
          <thead>
            <tr>${o.map(n=>`<th>${i(n)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${t.map(n=>`<tr>${n.map(d=>`<td>${b(d)}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
        <div class="footer-bar">
          <span>Clientify Compliance & Filing System</span>
          <span>Official Filing Report</span>
        </div>
        <script>
          window.onload = () => { window.print(); window.close(); }
        <\/script>
      </body>
    </html>
  `;r.document.write(g),r.document.close()},f=e=>{var r;const o=(r=e==null?void 0:e.gstProfile)==null?void 0:r.gstStatus,t=e==null?void 0:e.status;return o==="Closed"||o==="Cancelled"?{type:"cancelled",rowClass:"hover:bg-slate-50/70 dark:hover:bg-slate-800/50 opacity-90",tradeNameClass:"text-slate-800 dark:text-slate-200 font-semibold",legalNameClass:"text-slate-500 dark:text-slate-400 font-normal",gstinClass:"text-slate-500 dark:text-slate-400 font-mono font-medium",gstStatusBadgeClass:"bg-rose-50 text-rose-700 border border-rose-200/60 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60",clientStatusBadgeClass:"bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"}:o==="Suspended"?{type:"suspended",rowClass:"bg-amber-50/30 dark:bg-amber-950/20 hover:bg-amber-50/50 dark:hover:bg-amber-950/30",tradeNameClass:"text-slate-900 dark:text-white font-semibold",legalNameClass:"text-slate-500 dark:text-slate-400 font-normal",gstinClass:"text-amber-600 dark:text-amber-400 font-mono font-medium",gstStatusBadgeClass:"bg-amber-50 text-amber-700 border border-amber-200/60 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60",clientStatusBadgeClass:"bg-amber-50 text-amber-700 border border-amber-200/60 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60"}:t==="Inactive"?{type:"inactive",rowClass:"hover:bg-slate-50/70 dark:hover:bg-slate-800/50 opacity-90",tradeNameClass:"text-slate-800 dark:text-slate-200 font-medium",legalNameClass:"text-slate-400 dark:text-slate-500 font-normal",gstinClass:"text-slate-500 dark:text-slate-400 font-mono font-medium",gstStatusBadgeClass:"bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",clientStatusBadgeClass:"bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"}:t==="Litigation"?{type:"litigation",rowClass:"bg-purple-50/30 dark:bg-purple-950/20 hover:bg-purple-50/50 dark:hover:bg-purple-950/30",tradeNameClass:"text-slate-900 dark:text-white font-semibold",legalNameClass:"text-slate-500 dark:text-slate-400 font-normal",gstinClass:"text-purple-600 dark:text-purple-400 font-mono font-medium",gstStatusBadgeClass:"bg-emerald-50 text-emerald-700 border border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60",clientStatusBadgeClass:"bg-purple-50 text-purple-700 border border-purple-200/60 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/60"}:{type:"active",rowClass:"hover:bg-slate-50/70 dark:hover:bg-slate-800/50",tradeNameClass:"text-slate-900 dark:text-white font-semibold",legalNameClass:"text-slate-500 dark:text-slate-400 font-normal",gstinClass:"text-indigo-600 dark:text-indigo-400 font-mono font-medium",gstStatusBadgeClass:"bg-emerald-50 text-emerald-700 border border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60",clientStatusBadgeClass:"bg-emerald-50 text-emerald-700 border border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60"}},x=e=>{if(!e||!e.gstProfile)return"Uncategorized";const t=(e.gstProfile.sector||e.gstProfile.range||"").trim()||"Uncategorized";let r=e.gstProfile.jurisdictionType;r||(r=e.gstProfile.range&&!e.gstProfile.sector?"Center":"State");const l=r==="Center"?"Center":"State",a=t.toLowerCase();return a.includes("(state)")||a.includes("(center)")?t:a.endsWith(" state")||a.endsWith(" center")?`${t} (${l})`:`${t} (${l})`};export{f as a,m as e,x as g,c as p};
