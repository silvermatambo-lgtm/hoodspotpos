const paths={
 pos:'<rect width="20" height="13" x="2" y="3" rx="2"/><path d="M2 12h20M8 21h8m-4-5v5"/>',
 dashboard:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
 stock:'<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 12v10M7.5 4.3l9 5.2"/>',
 receipt:'<path d="M4 3v18l3-2 2 2 3-2 3 2 2-2 3 2V3l-3 2-2-2-3 2-3-2-2 2z"/><path d="M8 10h8m-8 4h5"/>',
 staff:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m18 0v-2a4 4 0 0 0-3-3.87M15 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
 arrow:'<path d="M5 12h14m-7-7 7 7-7 7"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',
 close:'<path d="m18 6-12 12M6 6l12 12"/>',
 search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
 cart:'<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h8.8a2 2 0 0 0 2-1.6L22 6H6"/>',
 cash:'<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M7 12h.01m10 0h.01"/>',
 phone:'<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
 card:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
 install:'<path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4"/>',
 exit:'<path d="M10 17l5-5-5-5m5 5H2m20 6v2a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-2m0-12V4a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1v2"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
 printer:'<path d="M6 9V3h12v6m0 8h2a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
 chart:'<path d="M3 3v18h18M8 16v-4m4 4V8m4 8v-6m4 6V5"/>',
 alert:'<path d="M10.3 3.7 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0ZM12 8v5m0 4h.01"/>',
 sync:'<path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-2l2 3m-16 8 2 3a7 7 0 0 0 12-2"/>',
 settings:'<path d="M4 7h16M4 12h16M4 17h16m-11-12v4m6 1v4m-7 1v4"/>',
 check:'<path d="m4 12 5 5L20 6"/>',
 copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 4v-.5A1.5 1.5 0 0 0 14.5 2h-11A1.5 1.5 0 0 0 2 3.5v11A1.5 1.5 0 0 0 3.5 16H4"/>'
};
export const icon=(name,size=20)=>`<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name]||paths.stock}</svg>`;
const bottles={
 'Beer':['#e49f54','#8c4a22','#efd59e','bottle'],
 'Cider':['#f3ce71','#9f681c','#e8e8a2','bottle'],
 'Spirits':['#bd90f4','#7452a6','#dec9f5','spirit'],
 'Mixers':['#78dfe2','#267888','#c0ece9','can'],
 'Soft drinks':['#95b8ff','#435da2','#d6e5ff','can'],
};
export function drink(category,name=''){
 const [a,b,c,shape]=bottles[category]||bottles.Beer;
 const color=name.includes('Black')?'#d77f7f':name.includes('Zambezi')?'#d4d48c':name.includes('Sprite')?'#80d59d':a;
 const body=shape==='can'?`<rect x="30" y="15" width="29" height="51" rx="7" fill="${b}"/><path d="M30 26h29v31H30z" fill="${color}"/><ellipse cx="44.5" cy="16" rx="14" ry="3" fill="${c}"/><path d="M42 16h6m-12 8v34" stroke="${c}" opacity=".65" stroke-width="2"/><path d="m47 29-8 15h7l-3 11 10-16h-7z" fill="${c}"/>`:shape==='spirit'?`<rect x="38" y="11" width="15" height="14" rx="3" fill="${color}"/><path d="M38 25h15l11 7v29q0 6-6 6H32q-6 0-6-6V32z" fill="${b}"/><rect x="27" y="39" width="36" height="21" rx="2" fill="${color}"/><path d="M33 43v13m8-6h10m-10 4h7" stroke="${c}" stroke-linecap="round" stroke-width="2"/>`:`<rect x="37" y="7" width="16" height="7" rx="2" fill="${color}"/><path d="M39 14h12v12q0 6 5 11l3 5v22q0 4-4 4H35q-4 0-4-4V42l3-5q5-5 5-11z" fill="${b}"/><path d="M39 15h12v10H39zM31 43h28v17H31z" fill="${color}"/><path d="M37 45v12m6-8h9m-9 5h6" stroke="${c}" stroke-width="2" stroke-linecap="round"/>`;
 return `<svg aria-hidden="true" width="91" height="78" viewBox="0 0 91 78"><circle cx="45" cy="40" r="33" fill="${color}" opacity=".12"/><circle cx="45" cy="40" r="24" fill="none" stroke="${color}" opacity=".2"/><path d="M15 27h8m-4-4v8m47 14h9m-4.5-4.5v9" stroke="${c}" opacity=".65" stroke-linecap="round"/><ellipse cx="45" cy="69" rx="23" ry="3" fill="#00111e" opacity=".45"/>${body}</svg>`;
}
