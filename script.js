const SUPABASE_URL = 'https://wtaluaiatlguefgwuuxy.supabase.co'; 
const SUPABASE_KEY = 'sb_publishable_XWA4yh4y8ShcWjg88jfKlg_YYNbFX2g'; 
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let dadosDoAluno = { rotinasTreino: [], rotinasDieta: [] };
let bibliotecaCompleta = [];
let bibliotecaAlimentosCompleta = [];
let listaGlobalAlunosCompleta = [];
let alunoIdSelecionado = "";
let modoEdicaoAtivo = false;
let gifAtualSendoExibido = "";
let idDiaDietaAtivo = "";

let blocoAlvoParaAdicionarExercicio = "";
let dietaAlvoIndices = { diaIdx: null, refIdx: null };
let estadosAbasExpandidas = {};

window.onload = async function() {
    await carregarAlunosDoBanco();
    await carregarBibliotecaDeExercicios();
    await carregarBibliotecaDeAlimentos();
    configurarAbas();
};

async function carregarAlunosDoBanco() {
    let { data: alunos } = await _supabase.from('alunos').select('*').order('nome');
    listaGlobalAlunosCompleta = alunos || [];
    const seletor = document.getElementById('selectAluno');
    if(listaGlobalAlunosCompleta.length > 0) {
        seletor.innerHTML = listaGlobalAlunosCompleta.map(a => `<option value="${a.id}">${a.nome}</option>`).join('');
        if(!alunoIdSelecionado) alunoIdSelecionado = listaGlobalAlunosCompleta[0].id;
        await puxarDadosDoAlunoDoBanco();
    }
}

async function carregarBibliotecaDeExercicios() {
    let { data: items } = await _supabase.from('biblioteca_exercicios').select('*').order('musculo, nome_exercicio');
    bibliotecaCompleta = items || [];
}

async function carregarBibliotecaDeAlimentos() {
    let { data: items } = await _supabase.from('biblioteca_alimentos').select('*').order('nome_alimento');
    bibliotecaAlimentosCompleta = items || [];
}

async function dbCadastrarExercicio() {
    const musculo = document.getElementById('add-lib-musculo').value.trim();
    const nome = document.getElementById('add-lib-nome').value.trim();
    const gif = document.getElementById('add-lib-gif').value.trim();
    if(!musculo || !nome || !gif) return alert("Preencha todos os campos.");
    await _supabase.from('biblioteca_exercicios').insert({ musculo, nome_exercicio: nome, gif_url: gif });
    alert("Exercício salvo!");
    document.getElementById('add-lib-nome').value = "";
    document.getElementById('add-lib-gif').value = "";
    await carregarBibliotecaDeExercicios();
}

async function dbCadastrarAlimentoReferencia() {
    const nome = document.getElementById('add-ref-nome').value.trim();
    const tipoMacro = document.getElementById('add-ref-macro-tipo').value;
    const qtd = Number(document.getElementById('add-ref-qtd').value);
    const prot = Number(document.getElementById('add-ref-prot').value);
    const carbo = Number(document.getElementById('add-ref-carbo').value);
    const gord = Number(document.getElementById('add-ref-gord').value);
    if(!nome || !qtd) return alert("Preencha o nome e a porção padrão.");

    let kcal = (prot * 4) + (carbo * 4) + (gord * 9);
    await _supabase.from('biblioteca_alimentos').insert({
        nome_alimento: nome, tipo_macro: tipoMacro, quantidade_padrao: qtd, carbo_padrao: carbo, prot_padrao: prot, gord_padrao: gord, kcal_padrao: kcal
    });
    alert("Alimento base indexado!");
    document.getElementById('add-ref-nome').value = "";
    await carregarBibliotecaDeAlimentos();
}

function abrirModalAlunos() { renderListaAlunos(); document.getElementById('modalAlunos').style.display = 'flex'; }
function fecharModalAlunos() { document.getElementById('modalAlunos').style.display = 'none'; }
function renderListaAlunos() {
    document.getElementById('listaAlunosParaEditar').innerHTML = listaGlobalAlunosCompleta.map((al, idx) => `
        <div class="item-aluno-edicao">
            <div class="form-row">
                <input type="text" class="input-inline" value="${al.nome}" onchange="listaGlobalAlunosCompleta[${idx}].nome = this.value; atualizarAlunoBanco(${idx})">
                <input type="email" class="input-inline" value="${al.email || ''}" onchange="listaGlobalAlunosCompleta[${idx}].email = this.value; atualizarAlunoBanco(${idx})">
            </div>
        </div>
    `).join('');
}
async function atualizarAlunoBanco(idx) {
    const al = listaGlobalAlunosCompleta[idx];
    await _supabase.from('alunos').update({ nome: al.nome, email: al.email }).eq('id', al.id);
    document.getElementById('selectAluno').options[idx].text = al.nome;
}
async function dbCriarAlunoRaiz() {
    const nome = document.getElementById('novo-nome-aluno').value.trim();
    const email = document.getElementById('novo-email-aluno').value.trim();
    await _supabase.from('alunos').insert({ nome, email });
    await carregarAlunosDoBanco();
    renderListaAlunos();
}

function recalcularCaloriasAutomaticas(idxD, idxR, idxA) {
    let item = dadosDoAluno.rotinasDieta[idxD].refeicoes[idxR].alimentos[idxA];
    item.kcalTotal = Number(((item.protTotal * 4) + (item.carboTotal * 4) + (item.gordTotal * 9)).toFixed(0));
    renderizarModoTreinador();
}

function recalcularMacrosPorPesoDigitado(idxD, idxR, idxA) {
    let item = dadosDoAluno.rotinasDieta[idxD].refeicoes[idxR].alimentos[idxA];
    if (!item.porcaoBase) return;
    let fator = item.quantidade / item.porcaoBase;
    item.carboTotal = Number((item.carboBase * fator).toFixed(1));
    item.protTotal = Number((item.protBase * fator).toFixed(1));
    item.gordTotal = Number((item.gordBase * fator).toFixed(1));
    item.kcalTotal = Number(((item.protTotal * 4) + (item.carboTotal * 4) + (item.gordTotal * 9)).toFixed(0));
    renderizarModoTreinador();
}

async function puxarDadosDoAlunoDoBanco() {
    if(!alunoIdSelecionado) return;
    let { data: blocos } = await _supabase.from('treinos_blocos').select('*').eq('aluno_id', alunoIdSelecionado).order('ordem');
    let treinos = [];
    if(blocos) {
        for(let b of blocos) {
            let { data: exs } = await _supabase.from('treinos_exercicios').select('*').eq('bloco_id', b.id);
            treinos.push({ idBloco: b.id, nomeBloco: b.nome_bloco, exercicios: exs || [] });
        }
    }
    let { data: dias } = await _supabase.from('dieta_dias').select('*').eq('aluno_id', alunoIdSelecionado).order('ordem');
    let dietas = [];
    if(dias) {
        for(let d of dias) {
            let { data: alims } = await _supabase.from('dieta_alimentos').select('*').eq('dia_id', d.id);
            let refs = {};
            if(alims) {
                alims.forEach(al => {
                    if(!refs[al.nome_refeicao]) refs[al.nome_refeicao] = { nomeRefeicao: al.nome_refeicao, alimentos: [] };
                    let q = al.quantidade;
                    refs[al.nome_refeicao].alimentos.push({
                        id: al.id, nome: al.nome_alimento, quantidade: q,
                        carboTotal: Number((al.carbo_g * q).toFixed(1)), protTotal: Number((al.prot_g * q).toFixed(1)), gordTotal: Number((al.gord_g * q).toFixed(1)), kcalTotal: Number((al.kcal_g * q).toFixed(0)),
                        porcaoBase: 100, carboBase: al.carbo_g * 100, protBase: al.prot_g * 100, gordBase: al.gord_g * 100
                    });
                });
            }
            dietas.push({ idDia: d.id, nomeDia: d.nome_dia, refeicoes: Object.values(refs) });
        }
    }
    dadosDoAluno.rotinasTreino = treinos;
    dadosDoAluno.rotinasDieta = dietas;
    if(dadosDoAluno.rotinasDieta.length > 0 && !idDiaDietaAtivo) idDiaDietaAtivo = dadosDoAluno.rotinasDieta[0].idDia;
    renderizarInterface();
}

function renderizarInterface() {
    if(modoEdicaoAtivo) { document.getElementById('appContainer').classList.add('modo-edicao-ativo'); renderizarModoTreinador(); }
    else { document.getElementById('appContainer').classList.remove('modo-edicao-ativo'); renderizarModoAluno(); }
}

function alternarBlocoLayout(id) {
    if(modoEdicaoAtivo) return;
    const el = document.getElementById(id);
    if(el) { 
        el.classList.toggle('expandido'); 
        estadosAbasExpandidas[id] = el.classList.contains('expandido'); 
        
        if(!el.classList.contains('expandido')) {
            fecharIframeSuave();
        }
    }
}

function renderizarModoAluno() {
    document.getElementById('container-blocos-treino').innerHTML = dadosDoAluno.rotinasTreino.map(b => `
        <div class="bloco-secao ${estadosAbasExpandidas[b.idBloco] ? 'expandido' : ''}" id="${b.idBloco}">
            <div class="header-bloco-editavel" onclick="alternarBlocoLayout('${b.idBloco}')">
                <div class="titulo-secao">${b.nomeBloco} <i class="fa-solid fa-chevron-down seta-recolher"></i></div>
            </div>
            <div class="corpo-recolhivel">
                <table>
                    <thead><tr><th>Exercício</th><th>Séries</th><th>Reps</th><th>Desc.</th></tr></thead>
                    <tbody>
                        ${b.exercicios.map(ex => `<tr><td style="color:var(--cor-neon); cursor:pointer;" onclick="gerenciarAnimacaoGif('${ex.gif_url}')"><i class="fa-solid fa-play-circle" style="margin-right:5px;"></i>${ex.nome}</td><td>${ex.series}</td><td>${ex.reps}</td><td>${ex.descanso}</td></tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `).join('');

    document.getElementById('container-dias-dieta').innerHTML = dadosDoAluno.rotinasDieta.map(d => `<button class="btn-dia ${d.idDia === idDiaDietaAtivo ? 'ativo' : ''}" onclick="idDiaDietaAtivo='${d.idDia}'; renderizarModoAluno();">${d.nomeDia}</button>`).join('');
    const dia = dadosDoAluno.rotinasDieta.find(d => d.idDia === idDiaDietaAtivo);
    if(!dia || dia.refeicoes.length === 0) { document.getElementById('conteudo-refeicoes-dinamicas').innerHTML = '<p style="text-align:center; padding:20px; color:var(--texto-mutado);">Nenhuma refeição activa.</p>'; return; }

    document.getElementById('conteudo-refeicoes-dinamicas').innerHTML = dia.refeicoes.map((ref, rIdx) => {
        const idRef = `ref_${dia.idDia}_${rIdx}`;
        let k=0, c=0, p=0, g=0;
        let linhas = ref.alimentos.map(al => { k+=al.kcalTotal; c+=al.carboTotal; p+=al.protTotal; g+=al.gordTotal; return `<tr><td>${al.nome}</td><td>${al.quantidade}g</td><td style="font-size:12px; color:var(--texto-mutado);">${Math.round(al.carboTotal)}g C / ${Math.round(al.protTotal)}g P / ${Math.round(al.gordTotal)}g G</td></tr>`; }).join('');
        return `
            <div class="bloco-secao ${estadosAbasExpandidas[idRef] ? 'expandido' : ''}" id="${idRef}">
                <div class="header-bloco-editavel" onclick="alternarBlocoLayout('${idRef}')">
                    <div class="titulo-secao">${ref.nomeRefeicao} <span style="font-size:12px; color:var(--cor-neon); margin-left:auto; margin-right:10px;">${Math.round(k)} Kcal</span> <i class="fa-solid fa-chevron-down seta-recolher"></i></div>
                </div>
                <div class="corpo-recolhivel">
                    <table><thead><tr><th>Alimento</th><th>Qtd</th><th>Macros</th></tr></thead><tbody>${linhas}</tbody></table>
                    <div class="resumo-macros">
                        <div class="macro-box"><p>Kcal</p><div>${Math.round(k)}</div></div><div class="macro-box"><p>Carbo</p><div>${Math.round(c)}g</div></div><div class="macro-box"><p>Prot</p><div>${Math.round(p)}g</div></div><div class="macro-box"><p>Gord</p><div>${Math.round(g)}g</div></div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderizarModoTreinador() {
    fecharIframeImediato();
    document.getElementById('container-blocos-treino').innerHTML = dadosDoAluno.rotinasTreino.map((b, bIdx) => `
        <div class="bloco-secao expandido">
            <div class="header-bloco-editavel">
                <input type="text" class="input-inline" style="color:var(--cor-neon); font-weight:bold;" value="${b.nomeBloco}" onchange="dadosDoAluno.rotinasTreino[${bIdx}].nomeBloco = this.value">
                <button class="btn-danger" onclick="dadosDoAluno.rotinasTreino.splice(${bIdx},1); renderizarModoTreinador();">Excluir</button>
            </div>
            <div class="corpo-recolhivel" style="display:block;">
                <table>
                    <thead><tr><th>Exercício</th><th>Séries</th><th>Reps</th><th>Desc.</th><th>Del</th></tr></thead>
                    <tbody>
                        ${b.exercicios.map((ex, eIdx) => `<tr><td>${ex.nome}</td><td><input type="text" class="input-inline" value="${ex.series}" onchange="dadosDoAluno.rotinasTreino[${bIdx}].exercicios[${eIdx}].series=this.value"></td><td><input type="text" class="input-inline" value="${ex.reps}" onchange="dadosDoAluno.rotinasTreino[${bIdx}].exercicios[${eIdx}].reps=this.value"></td><td><input type="text" class="input-inline" value="${ex.descanso}" onchange="dadosDoAluno.rotinasTreino[${bIdx}].exercicios[${eIdx}].descanso=this.value"></td><td><button class="btn-remover" onclick="dadosDoAluno.rotinasTreino[${bIdx}].exercicios.splice(${eIdx},1); renderizarModoTreinador();"><i class="fa-solid fa-trash"></i></button></td></tr>`).join('')}
                    </tbody>
                </table>
                <button class="btn btn-add" onclick="abrirModalBibliotecaParaBloco('${b.idBloco}')"><i class="fa-solid fa-folder-plus"></i> Buscar Exercício na Biblioteca</button>
            </div>
        </div>
    `).join('');

    document.getElementById('container-dias-dieta').innerHTML = dadosDoAluno.rotinasDieta.map((d, dIdx) => `
        <div style="display:flex; gap:5px; background:var(--bg-card); padding:5px; border-radius:6px; border:1px solid #4b5563;">
            <input type="text" class="input-inline" style="width:120px;" value="${d.nomeDia}" onchange="dadosDoAluno.rotinasDieta[${dIdx}].nomeDia = this.value">
            <button class="btn-remover" onclick="dadosDoAluno.rotinasDieta.splice(${dIdx},1); renderizarModoTreinador();"><i class="fa-solid fa-trash"></i></button>
        </div>
    `).join('');

    document.getElementById('conteudo-refeicoes-dinamicas').innerHTML = dadosDoAluno.rotinasDieta.map((d, dIdx) => `
        <div style="border:1px dashed var(--cor-neon); padding:15px; border-radius:12px; margin-bottom:20px;">
            <p style="color:var(--cor-neon); font-weight:bold; margin-bottom:10px;"><i class="fa-solid fa-calendar-day"></i> Refeições do dia: ${d.nomeDia}</p>
            ${d.refeicoes.map((ref, rIdx) => `
                <div class="bloco-secao expandido" style="background:#111827;">
                    <div class="header-bloco-editavel">
                        <input type="text" class="input-inline" value="${ref.nomeRefeicao}" onchange="dadosDoAluno.rotinasDieta[${dIdx}].refeicoes[${rIdx}].nomeRefeicao=this.value">
                        <button class="btn-danger" onclick="dadosDoAluno.rotinasDieta[${dIdx}].refeicoes.splice(${rIdx},1); renderizarModoTreinador();">Excluir</button>
                    </div>
                    <div class="corpo-recolhivel" style="display:block;">
                        <table>
                            <thead><tr><th>Alimento</th><th>Peso (g)</th><th>C (g)</th><th>P (g)</th><th>G (g)</th><th>Kcal</th><th>Del</th></tr></thead>
                            <tbody>
                                ${ref.alimentos.map((al, aIdx) => `<tr><td><input type="text" class="input-inline" value="${al.nome}" onchange="dadosDoAluno.rotinasDieta[${dIdx}].refeicoes[${rIdx}].alimentos[${aIdx}].nome=this.value"></td><td><input type="number" class="input-inline" value="${al.quantidade}" onchange="dadosDoAluno.rotinasDieta[${dIdx}].refeicoes[${rIdx}].alimentos[${aIdx}].quantidade=Number(this.value); recalcularMacrosPorPesoDigitado(${dIdx},${rIdx},${aIdx});"></td><td><input type="number" step="0.1" class="input-inline" value="${al.carboTotal}" onchange="dadosDoAluno.rotinasDieta[${dIdx}].refeicoes[${rIdx}].alimentos[${aIdx}].carboTotal=Number(this.value); recalcularCaloriasAutomaticas(${dIdx},${rIdx},${aIdx});"></td><td><input type="number" step="0.1" class="input-inline" value="${al.protTotal}" onchange="dadosDoAluno.rotinasDieta[${dIdx}].refeicoes[${rIdx}].alimentos[${aIdx}].protTotal=Number(this.value); recalcularCaloriasAutomaticas(${dIdx},${rIdx},${aIdx});"></td><td><input type="number" step="0.1" class="input-inline" value="${al.gordTotal}" onchange="dadosDoAluno.rotinasDieta[${dIdx}].refeicoes[${rIdx}].alimentos[${aIdx}].gordTotal=Number(this.value); recalcularCaloriasAutomaticas(${dIdx},${rIdx},${aIdx});"></td><td><input type="number" class="input-inline" value="${al.kcalTotal}" readonly style="opacity:0.5;"></td><td><button class="btn-remover" onclick="dadosDoAluno.rotinasDieta[${dIdx}].refeicoes[${rIdx}].alimentos.splice(${aIdx},1); renderizarModoTreinador();"><i class="fa-solid fa-trash"></i></button></td></tr>`).join('')}
                            </tbody>
                        </table>
                        <button class="btn btn-add" style="background:#1e293b;" onclick="abrirModalAlimentosParaRefeicao(${dIdx}, ${rIdx})"><i class="fa-solid fa-basket-shopping"></i> Buscar Alimento na Referência</button>
                    </div>
                </div>
            `).join('')}
            <button class="btn btn-add" onclick="dadosDoAluno.rotinasDieta[${dIdx}].refeicoes.push({nomeRefeicao:'Nova Refeição',alimentos:[]}); renderizarModoTreinador();">+ Nova Refeição</button>
        </div>
    `).join('');
}

function abrirModalBibliotecaParaBloco(idB) {
    blocoAlvoParaAdicionarExercicio = idB;
    let ag = {}; bibliotecaCompleta.forEach(e => { if(!ag[e.musculo]) ag[e.musculo] = []; ag[e.musculo].push(e); });
    document.getElementById('modalBodyPastas').innerHTML = Object.keys(ag).map((m, i) => `
        <div class="pasta-musculo" onclick="document.getElementById('p_ex_${i}').classList.toggle('aberta')"><i class="fa-solid fa-folder" style="color:#f59e0b;"></i> ${m} (${ag[m].length})</div>
        <div class="lista-exercicios-pasta" id="p_ex_${i}">
            ${ag[m].map(ex => `<div class="item-exercicio-biblioteca" onclick="injetarExercicio('${ex.nome_exercicio}','${ex.gif_url}')">${ex.nome_exercicio} <i class="fa-solid fa-plus" style="color:var(--verde);"></i></div>`).join('')}
        </div>
    `).join('');
    document.getElementById('modalBiblioteca').style.display = 'flex';
}
function fecharModalBiblioteca() { document.getElementById('modalBiblioteca').style.display = 'none'; }
function injetarExercicio(n, g) {
    let b = dadosDoAluno.rotinasTreino.find(x => x.idBloco === blocoAlvoParaAdicionarExercicio);
    if(b) b.exercicios.push({ id: "ex_"+Date.now(), nome: n, series: "4", reps: "10", descanso: "60\"", gif_url: g });
    fecharModalBiblioteca(); renderizarModoTreinador();
}

function abrirModalAlimentosParaRefeicao(diaIdx, refIdx) {
    dietaAlvoIndices = { diaIdx, refIdx };
    let ag = { "Carbo": [], "Proteína": [], "Gordura": [] };
    bibliotecaAlimentosCompleta.forEach(al => {
        let cat = al.tipo_macro || "Carbo";
        if(ag[cat]) ag[cat].push(al);
    });
    document.getElementById('modalBodyPastasAlimentos').innerHTML = Object.keys(ag).map((macro, i) => `
        <div class="pasta-musculo" onclick="document.getElementById('p_al_${i}').classList.toggle('aberta')">
            <i class="fa-solid fa-folder" style="color:#10b981;"></i> Pasta de ${macro} (${ag[macro].length})
        </div>
        <div class="lista-exercicios-pasta" id="p_al_${i}">
            ${ag[macro].map(al => `
                <div class="item-exercicio-biblioteca" onclick="injetarAlimentoReferencia(${JSON.stringify(al).replace(/"/g, '&quot;')})">
                    <span>${al.nome_alimento} <small style="color:var(--texto-mutado);">(${al.quantidade_padrao}g)</small></span>
                    <i class="fa-solid fa-circle-plus" style="color:var(--cor-neon);"></i>
                </div>
            `).join('')}
        </div>
    `).join('');
    document.getElementById('modalAlimentosRef').style.display = 'flex';
}
function fecharModalAlimentosRef() { document.getElementById('modalAlimentosRef').style.display = 'none'; }

function injetarAlimentoReferencia(al) {
    const { diaIdx, refIdx } = dietaAlvoIndices;
    if(diaIdx !== null && refIdx !== null) {
        dadosDoAluno.rotinasDieta[diaIdx].refeicoes[refIdx].alimentos.push({
            id: "al_" + Date.now(), nome: al.nome_alimento, quantidade: al.quantidade_padrao,
            carboTotal: al.carbo_padrao, protTotal: al.prot_padrao, gordTotal: al.gord_padrao, kcalTotal: al.kcal_padrao,
            porcaoBase: al.quantidade_padrao, carboBase: al.carbo_padrao, protBase: al.prot_padrao, gordBase: al.gord_padrao
        });
    }
    fecharModalAlimentosRef(); renderizarModoTreinador();
}

async function salvarAlteracoesNoBanco() {
    if(!alunoIdSelecionado) return;
    alert("Sincronizando dados...");
    await _supabase.from('treinos_blocos').delete().eq('aluno_id', alunoIdSelecionado);
    for(let [i, b] of dadosDoAluno.rotinasTreino.entries()) {
        let { data: nb } = await _supabase.from('treinos_blocos').insert({ aluno_id: alunoIdSelecionado, nome_bloco: b.nomeBloco, ordem: i }).select().single();
        if(nb && b.exercicios.length > 0) {
            await _supabase.from('treinos_exercicios').insert(b.exercicios.map(e => ({ bloco_id: nb.id, nome: e.nome, series: e.series, reps: e.reps, descanso: e.descanso, gif_url: e.gif_url })));
        }
    }
    await _supabase.from('dieta_dias').delete().eq('aluno_id', alunoIdSelecionado);
    for(let [i, d] of dadosDoAluno.rotinasDieta.entries()) {
        let { data: nd } = await _supabase.from('dieta_dias').insert({ aluno_id: alunoIdSelecionado, nome_dia: d.nomeDia, ordem: i }).select().single();
        if(nd) {
            let inserts = [];
            d.refeicoes.forEach(r => {
                r.alimentos.forEach(al => {
                    let q = al.quantidade || 1;
                    inserts.push({ dia_id: nd.id, nome_refeicao: r.nomeRefeicao, nome_alimento: al.nome, quantidade: q, carbo_g: al.carboTotal/q, prot_g: al.protTotal/q, gord_g: al.gordTotal/q, kcal_g: al.kcalTotal/q });
                });
            });
            if(inserts.length > 0) await _supabase.from('dieta_alimentos').insert(inserts);
        }
    }
    alert("Salvo com sucesso!");
    document.getElementById('btnEditar').click();
    await puxarDadosDoAlunoDoBanco();
}

function trocarAlunoNoPainel(id) { alunoIdSelecionado=id; idDiaDietaAtivo=""; puxarDadosDoAlunoDoBanco(); }

// ALTERAÇÃO: Gerenciador de animação com efeito mais lento (0.5s), subindo ao abrir e descendo ao fechar.
function gerenciarAnimacaoGif(url) {
    const c = document.getElementById('containerGif'); 
    const ifr = document.getElementById('videoIframe');
    
    // Configura a transição CSS base para suavidade completa
    c.style.transition = 'max-height 0.5s ease-in-out, opacity 0.5s ease-in-out, transform 0.5s ease-in-out, padding 0.5s ease-in-out';
    c.style.overflow = 'hidden';

    // Se clicar no mesmo exercício, fecha suavemente
    if (gifAtualSendoExibido === url) { 
        fecharIframeSuave();
        return; 
    }
    
    // Se o player já está aberto trocando para outro exercício (Fade rápido no conteúdo)
    if (gifAtualSendoExibido !== "" && c.style.opacity === '1') {
        c.style.opacity = '0';
        c.style.transform = 'translateY(15px)'; // Leve descida na troca externa
        
        setTimeout(() => {
            ifr.src = url;
            gifAtualSendoExibido = url;
            c.style.opacity = '1';
            c.style.transform = 'translateY(0)';
            c.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 200);
    } else {
        // Player fechado -> abrindo (Movimento vindo de baixo "subindo")
        ifr.src = url; 
        gifAtualSendoExibido = url;
        
        // Estado inicial oculto/abaixo
        c.style.maxHeight = '0px';
        c.style.opacity = '0';
        c.style.transform = 'translateY(40px)'; 
        c.style.display = 'block'; 
        
        // Força o reflow do navegador para processar o estado inicial antes da animação
        c.offsetHeight; 

        // Ativa os estados finais de abertura (subindo e expandindo)
        c.style.maxHeight = '500px'; 
        c.style.opacity = '1';
        c.style.transform = 'translateY(0)';
        
        c.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// ALTERAÇÃO: Animação de fechamento controlada (descendo e encolhendo)
function fecharIframeSuave() {
    const c = document.getElementById('containerGif');
    const ifr = document.getElementById('videoIframe');
    
    if(!c || gifAtualSendoExibido === "") return;

    c.style.transition = 'max-height 0.5s ease-in-out, opacity 0.5s ease-in-out, transform 0.5s ease-in-out, padding 0.5s ease-in-out';
    
    // Ativa animação de descida e encolhimento vertical
    c.style.maxHeight = '0px';
    c.style.opacity = '0';
    c.style.transform = 'translateY(40px)'; 
    
    // Limpa a URL e reseta estados somente após o término da animação física (500ms)
    setTimeout(() => {
        if (ifr) ifr.src = ""; 
        gifAtualSendoExibido = "";
    }, 500);
}

// Fechamento instantâneo sem delay para transição de abas do app
function fecharIframeImediato() { 
    const c = document.getElementById('containerGif');
    if(c) {
        c.style.transition = 'none';
        c.style.maxHeight = '0px';
        c.style.opacity = '0';
        c.style.transform = 'translateY(40px)';
    }
    const ifr = document.getElementById('videoIframe');
    if(ifr) ifr.src = ""; 
    gifAtualSendoExibido = ""; 
}

function configurarAbas() {
    document.querySelectorAll('.menu-abas .aba-link').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.menu-abas .aba-link').forEach(b => b.classList.remove('ativa'));
            document.querySelectorAll('.conteudo-aba').forEach(c => c.classList.remove('ativa'));
            btn.classList.add('ativa'); document.getElementById(btn.dataset.aba).classList.add('ativa');
            fecharIframeImediato(); renderizarInterface();
        });
    });
}

document.getElementById('btn-novo-bloco-treino').addEventListener('click', () => {
    dadosDoAluno.rotinasTreino.push({ idBloco: "n_"+Date.now(), nomeBloco: 'Novo Bloco Treino', exercicios: [] });
    renderizarModoTreinador();
});
document.getElementById('btn-novo-dia-dieta').addEventListener('click', () => {
    let id = "nd_"+Date.now();
    dadosDoAluno.rotinasDieta.push({ idDia: id, nomeDia: 'Novo Protocolo', refeicoes: [] });
    idDiaDietaAtivo = id; renderizarModoTreinador();
});

document.getElementById('btnEditar').addEventListener('click', () => {
    modoEdicaoAtivo = !modoEdicaoAtivo;
    const btn = document.getElementById('btnEditar');
    if(modoEdicaoAtivo) {
        btn.innerHTML = '<i class="fa-solid fa-xmark"></i> Sair da Edição'; btn.style.background = '#4b5563';
        document.getElementById('btnSalvar').style.display = 'flex';
        document.getElementById('btnGerenciarAlunos').style.display = 'flex';
        document.querySelectorAll('.btn-admin-acao').forEach(el => el.style.display = 'flex');
        document.getElementById('btn-novo-bloco-treino').style.display = 'flex';
        document.getElementById('btn-novo-dia-dieta').style.display = 'flex';
        renderizarModoTreinador();
    } else {
        btn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Ativar Edição'; btn.style.background = '#3b82f6';
        document.getElementById('btnSalvar').style.display = 'none';
        document.getElementById('btnGerenciarAlunos').style.display = 'none';
        document.querySelectorAll('.btn-admin-acao').forEach(el => el.style.display = 'none');
        document.getElementById('btn-novo-bloco-treino').style.display = 'none';
        document.getElementById('btn-novo-dia-dieta').style.display = 'none';
        renderizarModoAluno();
    }
});