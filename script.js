const SUPABASE_URL = "https://wtaluaiatlguefgwuuxy.supabase.co";
const SUPABASE_KEY = "sb_publishable_XWA4yh4y8ShcWjg88jfKlg_YYNbFX2g";

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let dadosDoAluno = { rotinasTreino: [], rotinasDieta: [] };
let bibliotecaCompleta = [];
let bibliotecaAlimentosCompleta = [];
let listaGlobalAlunosCompleta = [];
let alunoIdSelecionado = "";
let modoEdicaoAtivo = false;
let gifIdAbertoVisaoAluno = null;

let blocoAlvoParaAdicionarExercicio = "";
let dietaAlvoIndices = { diaIdx: null, refIdx: null };
let estadosAbasExpandidas = {};

// Controle para saber se o modal abriu para Gerenciamento Geral do Banco ou para Inserção no Aluno
let modoGerenciamentoBancoAtivo = false;

// Variáveis de controle para o Drag and Drop
let blocoArrastadoIdx = null;
let exercicioArrastadoCoords = { blocoIdx: null, exIdx: null };
let diaArrastadoIdx = null;
let refeicaoArrastadaCoords = { dIdx: null, rIdx: null };

const LISTA_SERIES = [
  "2",
  "3",
  "4",
  "5",
  "1 (Aquec.)",
  "2 (Aquec.)",
  "7 (FST-7)",
  "10 (GVT)",
];
const LISTA_REPS = ["8~12", "8~15", "10~15", "12~15", "20~25"];
const LISTA_DESCANSO = [
  "30s",
  "45s",
  "60s",
  "90s",
  "120s",
  "45~60s",
  "120~180s",
];

window.onload = async function () {
  await carregarAlunosDoBanco();
  await carregarBibliotecaDeExercicios();
  await carregarBibliotecaDeAlimentos();
  configureAbas();
};

function gerarSelectHtml(lista, valorAtual, onChangeStr) {
  const stringLogicaScroll = `event.preventDefault(); if(event.deltaY > 0) { if(this.selectedIndex < this.options.length - 1) { this.selectedIndex++; this.dispatchEvent(new Event('change')); } } else { if(this.selectedIndex > 0) { this.selectedIndex--; this.dispatchEvent(new Event('change')); } }`;
  return `<select class="input-inline" onwheel="${stringLogicaScroll}" style="background:#1f2937; color:white; border:1px solid #4b5563; cursor:ns-resize;" onchange="${onChangeStr}">
        ${lista.map((item) => `<option value="${item}" ${valorAtual == item ? "selected" : ""}>${item}</option>`).join("")}
    </select>`;
}

// ==========================================================================
// --- CARREGAMENTO DE DADOS (SUPABASE) ---
// ==========================================================================

async function carregarAlunosDoBanco() {
  let { data: alunos } = await _supabase
    .from("alunos")
    .select("*")
    .order("nome");
  listaGlobalAlunosCompleta = alunos || [];
  const seletor = document.getElementById("selectAluno");
  if (listaGlobalAlunosCompleta.length > 0) {
    seletor.innerHTML = listaGlobalAlunosCompleta
      .map((a) => `<option value="${a.id}">${a.nome}</option>`)
      .join("");
    if (!alunoIdSelecionado)
      alunoIdSelecionado = listaGlobalAlunosCompleta[0].id;
    await puxarDadosDoAlunoDoBanco();
  }
}

async function carregarBibliotecaDeExercicios() {
  let { data: items } = await _supabase
    .from("biblioteca_exercicios")
    .select("*")
    .order("musculo, nome_exercicio");
  bibliotecaCompleta = items || [];
}

async function carregarBibliotecaDeAlimentos() {
  let { data: items } = await _supabase
    .from("biblioteca_alimentos")
    .select("*")
    .order("nome_alimento");
  bibliotecaAlimentosCompleta = items || [];
}

async function puxarDadosDoAlunoDoBanco() {
  if (!alunoIdSelecionado) return;
  let { data: blocos } = await _supabase
    .from("treinos_blocos")
    .select("*")
    .eq("aluno_id", alunoIdSelecionado)
    .order("ordem");
  let treinos = [];
  if (blocos) {
    for (let b of blocos) {
      let { data: exs } = await _supabase
        .from("treinos_exercicios")
        .select("*")
        .eq("bloco_id", b.id)
        .order("ordem");
      treinos.push({
        idBloco: b.id,
        nomeBloco: b.nome_bloco,
        exercicios: exs || [],
      });
    }
  }
  let { data: dias } = await _supabase
    .from("dieta_dias")
    .select("*")
    .eq("aluno_id", alunoIdSelecionado)
    .order("ordem");
  let dietas = [];
  if (dias) {
    for (let d of dias) {
      let { data: alims } = await _supabase
        .from("dieta_alimentos")
        .select("*")
        .eq("dia_id", d.id);
      let refs = {};
      if (alims) {
        alims.forEach((al) => {
          if (!refs[al.nome_refeicao])
            refs[al.nome_refeicao] = {
              nomeRefeicao: al.nome_refeicao,
              alimentos: [],
            };
          let q = al.quantidade;
          refs[al.nome_refeicao].alimentos.push({
            id: al.id,
            nome: al.nome_alimento,
            quantidade: q,
            carboTotal: Number((al.carbo_g * q).toFixed(1)),
            protTotal: Number((al.prot_g * q).toFixed(1)),
            gordTotal: Number((al.gord_g * q).toFixed(1)),
            kcalTotal: Number((al.kcal_g * q).toFixed(0)),
            porcaoBase: 100,
            carboBase: al.carbo_g * 100,
            protBase: al.prot_g * 100,
            gordBase: al.gord_g * 100,
          });
        });
      }
      dietas.push({
        idDia: d.id,
        nomeDia: d.nome_dia,
        refeicoes: Object.values(refs),
      });
    }
  }
  dadosDoAluno.rotinasTreino = treinos;
  dadosDoAluno.rotinasDieta = dietas;
  renderizarInterface();
}

// ==========================================================================
// --- CADASTROS GERAIS (INSERÇÃO DE REFERÊNCIAS NO BANCO) ---
// ==========================================================================

async function dbCadastrarExercicio() {
  const musculo = document.getElementById("add-lib-musculo").value.trim();
  const nome = document.getElementById("add-lib-nome").value.trim();
  const gif = document.getElementById("add-lib-gif").value.trim();
  if (!musculo || !nome || !gif) return alert("Preencha todos os campos.");
  await _supabase
    .from("biblioteca_exercicios")
    .insert({ musculo, nome_exercicio: nome, gif_url: gif });
  alert("Exercício saved!");
  document.getElementById("add-lib-nome").value = "";
  document.getElementById("add-lib-gif").value = "";
  await carregarBibliotecaDeExercicios();
}

async function dbCadastrarAlimentoReferencia() {
  const nome = document.getElementById("add-ref-nome").value.trim();
  const tipoMacro = document.getElementById("add-ref-macro-tipo").value;
  const qtd = Number(document.getElementById("add-ref-qtd").value);
  const prot = Number(document.getElementById("add-ref-prot").value);
  const carbo = Number(document.getElementById("add-ref-carbo").value);
  const gord = Number(document.getElementById("add-ref-gord").value);
  if (!nome || !qtd) return alert("Preencha o nome e a porção padrão.");

  let kcal = prot * 4 + carbo * 4 + gord * 9;
  await _supabase.from("biblioteca_alimentos").insert({
    nome_alimento: nome,
    tipo_macro: tipoMacro,
    quantidade_padrao: qtd,
    carbo_padrao: carbo,
    prot_padrao: prot,
    gord_padrao: gord,
    kcal_padrao: kcal,
  });
  alert("Alimento base indexado!");
  document.getElementById("add-ref-nome").value = "";
  await carregarBibliotecaDeAlimentos();
}

// ==========================================================================
// --- GERENCIAMENTO DE RECURSOS DO BANCO (CORRIGIDO PARA EVITAR SYNTAXERROR) ---
// ==========================================================================

function abrirGerenciadorExerciciosBanco() {
  modoGerenciamentoBancoAtivo = true;
  const modalHeader = document.querySelector(
    "#modalBiblioteca .modal-header h3",
  );
  if (modalHeader) {
    modalHeader.innerHTML = `<i class="fa-solid fa-folder-gear" style="color: var(--vermelho);"></i> Gerenciar Banco de Exercícios`;
  }
  document.getElementById("modalBiblioteca").style.display = "flex";
  renderizarAbasGerenciadorExercicios();
}

function abrirGerenciadorAlimentosBanco() {
  modoGerenciamentoBancoAtivo = true;
  const modalHeader = document.querySelector(
    "#modalAlimentosRef .modal-header h3",
  );
  if (modalHeader) {
    modalHeader.innerHTML = `<i class="fa-solid fa-folder-gear" style="color: var(--vermelho);"></i> Gerenciar Banco de Alimentos`;
  }
  document.getElementById("modalAlimentosRef").style.display = "flex";
  renderizarAbasGerenciadorAlimentos();
}

function renderizarAbasGerenciadorExercicios() {
  let ag = {};
  bibliotecaCompleta.forEach((e) => {
    if (!ag[e.musculo]) ag[e.musculo] = [];
    ag[e.musculo].push(e);
  });

  document.getElementById("modalBodyPastas").innerHTML = Object.keys(ag)
    .map(
      (m, i) => `
        <div class="pasta-musculo" onclick="alternarAcordeaoPasta('p_ex_gen_${i}')">
            <i class="fa-solid fa-folder" style="color:var(--vermelho);"></i> ${m} (${ag[m].length})
        </div>
        <div class="lista-exercicios-pasta" id="p_ex_gen_${i}">
          <div class="lista-exercicios-pasta-inner">
            ${ag[m]
              .map((ex) => {
                const nomeEscapado = ex.nome_exercicio.replace(/'/g, "\\'");
                return `<div class="item-exercicio-biblioteca" style="cursor:default;">
                    <span style="color: white; font-weight: 500;">${ex.nome_exercicio}</span>
                    <div style="display: flex; gap: 12px; align-items: center;">
                        <button onclick="dbEditarNomeExercicio('${ex.id}', '${nomeEscapado}')" style="background:none; border:none; color:#3b82f6; cursor:pointer;" title="Editar Nome"><i class="fa-solid fa-pen"></i></button>
                        <button onclick="dbDeletarExercicioBanco('${ex.id}', '${nomeEscapado}')" style="background:none; border:none; color:var(--vermelho); cursor:pointer;" title="Deletar permanentemente"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>`;
              })
              .join("")}
          </div>
        </div>`,
    )
    .join("");
}

function renderizarAbasGerenciadorAlimentos() {
  let ag = { Carbo: [], Proteína: [], Gordura: [] };
  bibliotecaAlimentosCompleta.forEach((al) => {
    let cat = al.tipo_macro || "Carbo";
    if (ag[cat]) ag[cat].push(al);
  });

  document.getElementById("modalBodyPastasAlimentos").innerHTML = Object.keys(
    ag,
  )
    .map(
      (macro, i) => `
        <div class="pasta-musculo" onclick="alternarAcordeaoPasta('p_al_gen_${i}')">
            <i class="fa-solid fa-folder" style="color:var(--vermelho);"></i> Pasta de ${macro} (${ag[macro].length})
        </div>
        <div class="lista-exercicios-pasta" id="p_al_gen_${i}">
          <div class="lista-exercicios-pasta-inner">
            ${ag[macro]
              .map((al) => {
                const nomeEscapado = al.nome_alimento.replace(/'/g, "\\'");
                return `<div class="item-exercicio-biblioteca" style="cursor:default;">
                    <div style="display:flex; flex-direction:column; gap:2px;">
                        <span style="color: white; font-weight:500;">${al.nome_alimento}</span>
                        <span style="font-size:11px; color: var(--texto-mutado);">${al.quantidade_padrao}g | C: ${al.carbo_padrao}g | P: ${al.prot_padrao}g | G: ${al.gord_padrao}g</span>
                    </div>
                    <div style="display: flex; gap: 12px; align-items: center;">
                        <button onclick="dbEditarValoresAlimento('${al.id}')" style="background:none; border:none; color:#3b82f6; cursor:pointer;" title="Editar Alimento"><i class="fa-solid fa-pen"></i></button>
                        <button onclick="dbDeletarAlimentoBanco('${al.id}', '${nomeEscapado}')" style="background:none; border:none; color:var(--vermelho); cursor:pointer;" title="Deletar permanentemente"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>`;
              })
              .join("")}
          </div>
        </div>`,
    )
    .join("");
}

async function dbDeletarExercicioBanco(id, nome) {
  if (
    !confirm(
      `⚠️ ATENÇÃO TOTAL:\nQuer apagar permanentemente "${nome}" da biblioteca geral do sistema?`,
    )
  )
    return;
  await _supabase.from("biblioteca_exercicios").delete().eq("id", id);
  await carregarBibliotecaDeExercicios();
  renderizarAbasGerenciadorExercicios();
}

async function dbDeletarAlimentoBanco(id, nome) {
  if (
    !confirm(
      `⚠️ ATENÇÃO TOTAL:\nQuer apagar permanentemente "${nome}" da tabela de alimentos global?`,
    )
  )
    return;
  await _supabase.from("biblioteca_alimentos").delete().eq("id", id);
  await carregarBibliotecaDeAlimentos();
  renderizarAbasGerenciadorAlimentos();
}

async function dbEditarNomeExercicio(id, nomeAtual) {
  const novoNome = prompt("Alterar nome do exercício para:", nomeAtual);
  if (!novoNome || novoNome.trim() === "" || novoNome === nomeAtual) return;
  await _supabase
    .from("biblioteca_exercicios")
    .update({ nome_exercicio: novoNome.trim() })
    .eq("id", id);
  await carregarBibliotecaDeExercicios();
  renderizarAbasGerenciadorExercicios();
}

async function dbEditarValoresAlimento(id) {
  // Força a busca comparando strings limpas
  const al = bibliotecaAlimentosCompleta.find(
    (item) => String(item.id) === String(id),
  );
  if (!al) return alert("Alimento não encontrado na memória local.");

  const novoNome = prompt("Nome do Alimento:", al.nome_alimento);
  if (!novoNome) return;
  const novaQtd = prompt("Porção padrão (g):", al.quantidade_padrao);
  const novoCarbo = prompt("Carboidratos (g):", al.carbo_padrao);
  const novaProt = prompt("Proteínas (g):", al.prot_padrao);
  const novaGord = prompt("Gorduras (g):", al.gord_padrao);

  let kcal =
    Number(novaProt) * 4 + Number(novoCarbo) * 4 + Number(novaGord) * 9;

  await _supabase
    .from("biblioteca_alimentos")
    .update({
      nome_alimento: novoNome.trim(),
      quantidade_padrao: Number(novaQtd),
      carbo_padrao: Number(novoCarbo),
      prot_padrao: Number(novaProt),
      gord_padrao: Number(novaGord),
      kcal_padrao: Number(kcal.toFixed(0)),
    })
    .eq("id", id);

  await carregarBibliotecaDeAlimentos();
  renderizarAbasGerenciadorAlimentos();
}

// ==========================================================================
// --- GERENCIAMENTO DE ALUNOS ---
// ==========================================================================

function abrirModalAlunos() {
  renderListaAlunos();
  document.getElementById("modalAlunos").style.display = "flex";
}
function fecharModalAlunos() {
  document.getElementById("modalAlunos").style.display = "none";
}
function renderListaAlunos() {
  document.getElementById("listaAlunosParaEditar").innerHTML =
    listaGlobalAlunosCompleta
      .map(
        (al, idx) => `
        <div class="item-aluno-edicao">
            <div class="form-row">
                <input type="text" class="input-inline" value="${al.nome}" onchange="listaGlobalAlunosCompleta[${idx}].nome = this.value; atualizarAlunoBanco(${idx})">
                <input type="email" class="input-inline" value="${al.email || ""}" onchange="listaGlobalAlunosCompleta[${idx}].email = this.value; atualizarAlunoBanco(${idx})">
            </div>
        </div>
    `,
      )
      .join("");
}
async function atualizarAlunoBanco(idx) {
  const al = listaGlobalAlunosCompleta[idx];
  await _supabase
    .from("alunos")
    .update({ nome: al.nome, email: al.email })
    .eq("id", al.id);
  document.getElementById("selectAluno").options[idx].text = al.nome;
}
async function dbCriarAlunoRaiz() {
  const nome = document.getElementById("novo-nome-aluno").value.trim();
  const email = document.getElementById("novo-email-aluno").value.trim();
  await _supabase.from("alunos").insert({ nome, email });
  await carregarAlunosDoBanco();
  renderListaAlunos();
}

// ==========================================================================
// --- RECALCULOS E INTERFACES BASE ---
// ==========================================================================

function recalcularCaloriasAutomaticas(idxD, idxR, idxA) {
  let item = dadosDoAluno.rotinasDieta[idxD].refeicoes[idxR].alimentos[idxA];
  item.kcalTotal = Number(
    (item.protTotal * 4 + item.carboTotal * 4 + item.gordTotal * 9).toFixed(0),
  );
  renderizarModoTreinador();
}

function recalcularMacrosPorPesoDigitado(idxD, idxR, idxA) {
  let item = dadosDoAluno.rotinasDieta[idxD].refeicoes[idxR].alimentos[idxA];
  if (!item.porcaoBase) return;
  let factor = item.quantidade / item.porcaoBase;
  item.carboTotal = Number((item.carboBase * factor).toFixed(1));
  item.protTotal = Number((item.protBase * factor).toFixed(1));
  item.gordTotal = Number((item.gordBase * factor).toFixed(1));
  item.kcalTotal = Number(
    (item.protTotal * 4 + item.carboTotal * 4 + item.gordTotal * 9).toFixed(0),
  );
  renderizarModoTreinador();
}

function renderizarInterface() {
  if (modoEdicaoAtivo) {
    document.getElementById("appContainer").classList.add("modo-edicao-ativo");
    renderizarModoTreinador();
  } else {
    document
      .getElementById("appContainer")
      .classList.remove("modo-edicao-ativo");
    renderizarModoAluno();
  }
}

function alternarBlocoLayout(id) {
  const el = document.getElementById(id);
  if (el) {
    if (!el.classList.contains("expandido")) {
      const parent = el.closest(
        "#container-blocos-treino, #conteudo-refeicoes-dinamicas",
      );
      if (parent) {
        parent.querySelectorAll(".bloco-secao.expandido").forEach((openEl) => {
          if (openEl.id !== id) {
            openEl.classList.remove("expandido");
            estadosAbasExpandidas[openEl.id] = false;
          }
        });
      }
    }
    el.classList.toggle("expandido");
    estadosAbasExpandidas[id] = el.classList.contains("expandido");
  }
}

function alternarAcordeaoPasta(idConteudo) {
  const el = document.getElementById(idConteudo);
  if (!el) return;

  if (!el.classList.contains("aberta")) {
    const parent = el.parentElement;
    parent
      .querySelectorAll(".lista-exercicios-pasta.aberta")
      .forEach((aberta) => {
        if (aberta.id !== idConteudo) aberta.classList.remove("aberta");
      });
  }
  el.classList.toggle("aberta");
}

function alternarGifInline(exId, url) {
  if (modoEdicaoAtivo) return;

  const wrapperId = `gif-wrapper-${exId}`;
  const iconeId = `icone-gif-${exId}`;
  const wrapper = document.getElementById(wrapperId);
  const icone = document.getElementById(iconeId);

  if (!wrapper) return;

  const isOpening = !wrapper.classList.contains("aberto");

  // Fechar outros abertos
  if (isOpening) {
    document.querySelectorAll(".wrapper-gif-inline.aberto").forEach((el) => {
      el.classList.remove("aberto");
      setTimeout(() => {
        if (!el.classList.contains("aberto")) el.innerHTML = "";
      }, 500);

      const oldId = el.id.replace("gif-wrapper-", "");
      const oldIcone = document.getElementById(`icone-gif-${oldId}`);
      if (oldIcone) {
        oldIcone.classList.remove("fa-circle-dot");
        oldIcone.classList.add("fa-play-circle");
      }
    });
  }

  if (isOpening) {
    wrapper.innerHTML = `<iframe src="${url}" allowfullscreen scrolling="no" style="overflow: hidden;"></iframe>`;
    setTimeout(() => wrapper.classList.add("aberto"), 10);

    if (icone) {
      icone.classList.remove("fa-play-circle");
      icone.classList.add("fa-circle-dot");
    }
  } else {
    wrapper.classList.remove("aberto");
    setTimeout(() => {
      if (!wrapper.classList.contains("aberto")) wrapper.innerHTML = "";
    }, 500);

    if (icone) {
      icone.classList.remove("fa-circle-dot");
      icone.classList.add("fa-play-circle");
    }
  }
}

// ==========================================================================
// --- VISUALIZAÇÃO DO ALUNO ---
// ==========================================================================

function renderizarModoAluno() {
  document.getElementById("container-blocos-treino").innerHTML =
    dadosDoAluno.rotinasTreino
      .map((b) => {
        let linesHtml = b.exercicios
          .map((ex) => {
            let linhaBase = `<tr>
                <td style="color:var(--cor-neon); cursor:pointer;" onclick="alternarGifInline('${ex.id}', '${ex.gif_url}')">
                    <i class="fa-solid fa-play-circle" id="icone-gif-${ex.id}" style="margin-right:5px;"></i>${ex.nome}
                </td>
                <td>${ex.series}</td>
                <td>${ex.reps}</td>
                <td>${ex.descanso}</td>
            </tr>
            <tr class="linha-gif-inline">
                <td colspan="4">
                    <div class="wrapper-gif-inline" id="gif-wrapper-${ex.id}"></div>
                </td>
            </tr>`;
            return linhaBase;
          })
          .join("");

        return `
        <div class="bloco-secao ${estadosAbasExpandidas[b.idBloco] ? "expandido" : ""}" id="${b.idBloco}">
            <div class="header-bloco-editavel" onclick="alternarBlocoLayout('${b.idBloco}')">
                <div class="titulo-secao">${b.nomeBloco} <i class="fa-solid fa-chevron-down seta-recolher"></i></div>
            </div>
            <div class="corpo-recolhivel">
              <div class="corpo-recolhivel-inner">
                <table>
                    <thead><tr><th>Exercício</th><th>Séries</th><th>Reps</th><th>Desc.</th></tr></thead>
                    <tbody>${linesHtml}</tbody>
                </table>
              </div>
            </div>
        </div>`;
      })
      .join("");

  if (dadosDoAluno.rotinasDieta.length === 0) {
    document.getElementById("conteudo-refeicoes-dinamicas").innerHTML =
      '<p style="text-align:center; padding:20px; color:var(--texto-mutado);">Nenhuma dieta ativa cadastrada.</p>';
    return;
  }

  document.getElementById("conteudo-refeicoes-dinamicas").innerHTML =
    dadosDoAluno.rotinasDieta
      .map((dia) => {
        let diaKcal = 0,
          diaCarbo = 0,
          diaProt = 0,
          diaGord = 0;

        let htmlRefeicoesDoDia = dia.refeicoes
          .map((ref) => {
            let refKcal = 0,
              refCarbo = 0,
              refProt = 0,
              refGord = 0;
            let linesAlimentos = ref.alimentos
              .map((al) => {
                refKcal += al.kcalTotal;
                refCarbo += al.carboTotal;
                refProt += al.protTotal;
                refGord += al.gordTotal;
                return `<tr><td>${al.nome}</td><td>${al.quantidade}g</td><td style="font-size:12px; color:var(--texto-mutado);">${Math.round(al.carboTotal)}g C / ${Math.round(al.protTotal)}g P / ${Math.round(al.gordTotal)}g G</td></tr>`;
              })
              .join("");

            diaKcal += refKcal;
            diaCarbo += refCarbo;
            diaProt += refProt;
            diaGord += refGord;

            return `
                <div style="background: #111827; padding: 12px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #334155;">
                    <p style="font-weight: bold; color: white; border-bottom: 1px dashed #334155; padding-bottom: 6px; margin-bottom: 8px; display:flex; justify-content:space-between;">
                        <span><i class="fa-solid fa-plate-wheat" style="color:var(--verde); margin-right:6px;"></i>${ref.nomeRefeicao}</span>
                        <span style="color:var(--cor-neon); font-size:13px;">${Math.round(refKcal)} Kcal</span>
                    </p>
                    <table><thead><tr><th>Alimento</th><th>Qtd</th><th>Macros</th></tr></thead><tbody>${linesAlimentos}</tbody></table>
                </div>`;
          })
          .join("");

        if (dia.refeicoes.length === 0) {
          htmlRefeicoesDoDia =
            '<p style="color:var(--texto-mutado); font-size:13px; padding:10px 0;">Nenhuma refeição cadastrada para este dia.</p>';
        }

        return `
            <div class="bloco-secao dieta-fade-in ${estadosAbasExpandidas[dia.idDia] ? "expandido" : ""}" id="${dia.idDia}">
                <div class="header-bloco-editavel" onclick="alternarBlocoLayout('${dia.idDia}')">
                    <div class="titulo-secao">
                        <span><i class="fa-solid fa-calendar-day" style="color: var(--cor-neon); margin-right: 8px;"></i>${dia.nomeDia}</span>
                        <span style="font-size:13px; color:var(--cor-neon); margin-left:auto; margin-right:12px;">${Math.round(diaKcal)} Kcal</span>
                        <i class="fa-solid fa-chevron-down seta-recolher"></i>
                    </div>
                </div>
                <div class="corpo-recolhivel">
                  <div class="corpo-recolhivel-inner">
                    ${htmlRefeicoesDoDia}
                    <div class="resumo-macros" style="background:#090d16;">
                        <div class="macro-box"><p>Total Dia</p><div>${Math.round(diaKcal)} kcal</div></div>
                        <div class="macro-box"><p>Carbo</p><div>${Math.round(diaCarbo)}g</div></div>
                        <div class="macro-box"><p>Prot</p><div>${Math.round(diaProt)}g</div></div>
                        <div class="macro-box"><p>Gord</p><div>${Math.round(diaGord)}g</div></div>
                    </div>
                  </div>
                </div>
            </div>`;
      })
      .join("");
}

// ==========================================================================
// --- CONTROLE DE ARRASTAR E SOLTAR (DRAG & DROP) ---
// ==========================================================================

function dragBlocoStart(event, idx) {
  blocoArrastadoIdx = idx;
  event.dataTransfer.effectAllowed = "move";
}
function dragBlocoOver(event, idx) {
  event.preventDefault();
  if (blocoArrastadoIdx === null || blocoArrastadoIdx === idx) return;
  const itemArrastado = dadosDoAluno.rotinasTreino.splice(
    blocoArrastadoIdx,
    1,
  )[0];
  dadosDoAluno.rotinasTreino.splice(idx, 0, itemArrastado);
  blocoArrastadoIdx = idx;
  renderizarModoTreinador();
}
function dragBlocoEnd() {
  blocoArrastadoIdx = null;
}

function dragExercicioStart(event, bIdx, eIdx) {
  exercicioArrastadoCoords = { bIdx, eIdx };
  event.dataTransfer.effectAllowed = "move";
  event.stopPropagation();
}
function dragExercicioOver(event, bIdx, eIdx) {
  event.preventDefault();
  event.stopPropagation();
  const original = exercicioArrastadoCoords;
  if (
    original.bIdx === null ||
    original.bIdx !== bIdx ||
    (original.bIdx === bIdx && original.eIdx === eIdx)
  )
    return;
  const bloco = dadosDoAluno.rotinasTreino[bIdx];
  const itemArrastado = bloco.exercicios.splice(original.eIdx, 1)[0];
  bloco.exercicios.splice(eIdx, 0, itemArrastado);
  exercicioArrastadoCoords = { bIdx, eIdx };
  renderizarModoTreinador();
}
function dragExercicioEnd(event) {
  event.stopPropagation();
  exercicioArrastadoCoords = { bIdx: null, eIdx: null };
}

function dragDiaStart(event, idx) {
  diaArrastadoIdx = idx;
  event.dataTransfer.effectAllowed = "move";
}
function dragDiaOver(event, idx) {
  event.preventDefault();
  if (diaArrastadoIdx === null || diaArrastadoIdx === idx) return;
  const itemArrastado = dadosDoAluno.rotinasDieta.splice(diaArrastadoIdx, 1)[0];
  dadosDoAluno.rotinasDieta.splice(idx, 0, itemArrastado);
  diaArrastadoIdx = idx;
  renderizarModoTreinador();
}
function dragDiaEnd() {
  diaArrastadoIdx = null;
}

function dragRefeicaoStart(event, dIdx, rIdx) {
  refeicaoArrastadaCoords = { dIdx, rIdx };
  event.dataTransfer.effectAllowed = "move";
  event.stopPropagation();
}
function dragRefeicaoOver(event, dIdx, rIdx) {
  event.preventDefault();
  event.stopPropagation();
  const original = refeicaoArrastadaCoords;
  if (
    original.dIdx === null ||
    original.dIdx !== dIdx ||
    (original.dIdx === dIdx && original.rIdx === rIdx)
  )
    return;
  const dia = dadosDoAluno.rotinasDieta[dIdx];
  const itemArrastado = dia.refeicoes.splice(original.rIdx, 1)[0];
  dia.refeicoes.splice(rIdx, 0, itemArrastado);
  refeicaoArrastadaCoords = { dIdx, rIdx };
  renderizarModoTreinador();
}
function dragRefeicaoEnd(event) {
  event.stopPropagation();
  refeicaoArrastadaCoords = { dIdx: null, rIdx: null };
}

// ==========================================================================
// --- VISUALIZAÇÃO DO TREINADOR ---
// ==========================================================================

function renderizarModoTreinador() {
  document.getElementById("container-blocos-treino").innerHTML =
    dadosDoAluno.rotinasTreino
      .map(
        (b, bIdx) => `
        <div class="bloco-secao ${estadosAbasExpandidas[b.idBloco] ? "expandido" : ""}" id="${b.idBloco}" draggable="true" ondragstart="dragBlocoStart(event, ${bIdx})" ondragover="dragBlocoOver(event, ${bIdx})" ondragend="dragBlocoEnd()">
            <div class="header-bloco-editavel" onclick="if(!['INPUT','SELECT','BUTTON'].includes(event.target.tagName) && !event.target.classList.contains('drag-handle')) { alternarBlocoLayout('${b.idBloco}'); renderizarModoTreinador(); }">
                <input type="text" class="input-inline" style="color:var(--cor-neon); font-weight:bold;" value="${b.nomeBloco}" onchange="dadosDoAluno.rotinasTreino[${bIdx}].nomeBloco = this.value" onclick="event.stopPropagation();">
                <div style="display:flex; align-items:center; gap:10px; margin-left:auto;">
                    <button class="btn-danger" onclick="event.stopPropagation(); dadosDoAluno.rotinasTreino.splice(${bIdx},1); renderizarModoTreinador();">Excluir</button>
                    <i class="fa-solid fa-chevron-down seta-recolher"></i>
                    <i class="fa-solid fa-bars drag-handle" style="cursor: grab; color: #9ca3af; padding: 5px 10px; font-size: 18px;" title="Arrastar Bloco"></i>
                </div>
            </div>
            <div class="corpo-recolhivel">
              <div class="corpo-recolhivel-inner">
                <table>
                    <thead><tr><th>Exercício</th><th>Séries</th><th>Reps</th><th>Desc.</th><th>Del</th><th style="width: 40px;">Mover</th></tr></thead>
                    <tbody>
                        ${b.exercicios
                          .map(
                            (ex, eIdx) => `
                            <tr draggable="true" ondragstart="dragExercicioStart(event, ${bIdx}, ${eIdx})" ondragover="dragExercicioOver(event, ${bIdx}, ${eIdx})" ondragend="dragExercicioEnd(event)">
                                <td>${ex.nome}</td>
                                <td>${gerarSelectHtml(LISTA_SERIES, ex.series, `dadosDoAluno.rotinasTreino[${bIdx}].exercicios[${eIdx}].series=this.value`)}</td>
                                <td>${gerarSelectHtml(LISTA_REPS, ex.reps, `dadosDoAluno.rotinasTreino[${bIdx}].exercicios[${eIdx}].reps=this.value`)}</td>
                                <td>${gerarSelectHtml(LISTA_DESCANSO, ex.descanso, `dadosDoAluno.rotinasTreino[${bIdx}].exercicios[${eIdx}].descanso=this.value`)}</td>
                                <td><button class="btn-remover" onclick="dadosDoAluno.rotinasTreino[${bIdx}].exercicios.splice(${eIdx},1); renderizarModoTreinador();"><i class="fa-solid fa-trash"></i></button></td>
                                <td style="text-align: center;"><i class="fa-solid fa-grip-lines drag-handle" style="cursor: grab; color: #6b7280; font-size: 16px;" title="Arrastar Exercício"></i></td>
                            </tr>`,
                          )
                          .join("")}
                    </tbody>
                </table>
                <button class="btn btn-add" onclick="abrirModalBibliotecaParaBloco('${b.idBloco}')"><i class="fa-solid fa-folder-plus"></i> Buscar Exercício na Biblioteca</button>
              </div>
            </div>
        </div>`,
      )
      .join("");

  document.getElementById("conteudo-refeicoes-dinamicas").innerHTML =
    dadosDoAluno.rotinasDieta
      .map(
        (d, dIdx) => `
        <div class="bloco-secao ${estadosAbasExpandidas[d.idDia] ? "expandido" : ""}" id="${d.idDia}" draggable="true" ondragstart="dragDiaStart(event, ${dIdx})" ondragover="dragDiaOver(event, ${dIdx})" ondragend="dragDiaEnd()">
            <div class="header-bloco-editavel" onclick="if(!['INPUT','SELECT','BUTTON'].includes(event.target.tagName) && !event.target.classList.contains('drag-handle')) { alternarBlocoLayout('${d.idDia}'); renderizarModoTreinador(); }">
                <div style="display:flex; gap:5px; align-items:center;">
                    <i class="fa-solid fa-calendar-day" style="color:var(--cor-neon);"></i>
                    <input type="text" class="input-inline" style="width:160px; font-weight:bold; color:white;" value="${d.nomeDia}" onchange="dadosDoAluno.rotinasDieta[${dIdx}].nomeDia = this.value" onclick="event.stopPropagation();">
                </div>
                <div style="display:flex; align-items:center; gap:10px; margin-left:auto;">
                    <button class="btn-danger" style="padding: 8px 12px;" onclick="event.stopPropagation(); dadosDoAluno.rotinasDieta.splice(${dIdx},1); renderizarModoTreinador();"><i class="fa-solid fa-trash"></i> Excluir Dia</button>
                    <i class="fa-solid fa-chevron-down seta-recolher"></i>
                    <i class="fa-solid fa-bars drag-handle" style="cursor: grab; color: #9ca3af; padding: 5px 10px; font-size: 18px;" title="Arrastar Dia"></i>
                </div>
            </div>

            <div class="corpo-recolhivel">
              <div class="corpo-recolhivel-inner">
                ${d.refeicoes
                  .map(
                    (ref, rIdx) => `
                    <div style="background:#111827; padding:12px; border-radius:8px; margin-bottom:12px; border: 1px solid #334155;" draggable="true" ondragstart="dragRefeicaoStart(event, ${dIdx}, ${rIdx})" ondragover="dragRefeicaoOver(event, ${dIdx}, ${rIdx})" ondragend="dragRefeicaoEnd(event)">
                        <div class="header-bloco-editavel" style="margin-bottom:10px;">
                            <input type="text" class="input-inline" value="${ref.nomeRefeicao}" onchange="dadosDoAluno.rotinasDieta[${dIdx}].refeicoes[${rIdx}].nomeRefeicao=this.value" onclick="event.stopPropagation();">
                            <button class="btn-danger" onclick="dadosDoAluno.rotinasDieta[${dIdx}].refeicoes.splice(${rIdx},1); renderizarModoTreinador();">Excluir</button>
                            <i class="fa-solid fa-grip-lines drag-handle" style="cursor: grab; color: #6b7280; font-size: 16px; margin-left:5px;" title="Arrastar Refeição"></i>
                        </div>
                        <div>
                            <table>
                                <thead><tr><th>Alimento</th><th>Peso (g)</th><th>C (g)</th><th>P (g)</th><th>G (g)</th><th>Kcal</th><th>Del</th></tr></thead>
                                <tbody>
                                    ${ref.alimentos
                                      .map(
                                        (al, aIdx) => `
                                        <tr>
                                            <td><input type="text" class="input-inline" value="${al.nome}" onchange="dadosDoAluno.rotinasDieta[${dIdx}].refeicoes[${rIdx}].alimentos[${aIdx}].nome=this.value"></td>
                                            <td><input type="number" class="input-inline" value="${al.quantidade}" onchange="dadosDoAluno.rotinasDieta[${dIdx}].refeicoes[${rIdx}].alimentos[${aIdx}].quantidade=Number(this.value); recalcularMacrosPorPesoDigitado(${dIdx},${rIdx},${aIdx});"></td>
                                            <td><input type="number" step="0.1" class="input-inline" value="${al.carboTotal}" onchange="dadosDoAluno.rotinasDieta[${dIdx}].refeicoes[${rIdx}].alimentos[${aIdx}].carboTotal=Number(this.value); recalcularCaloriasAutomaticas(${dIdx},${rIdx},${aIdx});"></td>
                                            <td><input type="number" step="0.1" class="input-inline" value="${al.protTotal}" onchange="dadosDoAluno.rotinasDieta[${dIdx}].refeicoes[${rIdx}].alimentos[${aIdx}].protTotal=Number(this.value); recalcularCaloriasAutomaticas(${dIdx},${rIdx},${aIdx});"></td>
                                            <td><input type="number" step="0.1" class="input-inline" value="${al.gordTotal}" onchange="dadosDoAluno.rotinasDieta[${dIdx}].refeicoes[${rIdx}].alimentos[${aIdx}].gordTotal=Number(this.value); recalcularCaloriasAutomaticas(${dIdx},${rIdx},${aIdx});"></td>
                                            <td><input type="number" class="input-inline" value="${al.kcalTotal}" readonly style="opacity:0.5;"></td>
                                            <td><button class="btn-remover" onclick="dadosDoAluno.rotinasDieta[${dIdx}].refeicoes[${rIdx}].alimentos.splice(${aIdx},1); renderizarModoTreinador();"><i class="fa-solid fa-trash"></i></button></td>
                                        </tr>`,
                                      )
                                      .join("")}
                                </tbody>
                            </table>
                            <button class="btn btn-add" style="background:#1e293b;" onclick="abrirModalAlimentosParaRefeicao(${dIdx}, ${rIdx})"><i class="fa-solid fa-basket-shopping"></i> Buscar Alimento na Referência</button>
                        </div>
                    </div>`,
                  )
                  .join("")}
                <button class="btn btn-add" onclick="dadosDoAluno.rotinasDieta[${dIdx}].refeicoes.push({nomeRefeicao:'Nova Refeição',alimentos:[]}); renderizarModoTreinador();">+ Nova Refeição</button>
              </div>
            </div>
        </div>`,
      )
      .join("");
}

// ==========================================================================
// --- FLUXOS TRADICIONAIS DO SELETOR (INSERÇÃO DE ROTINA NO ALUNO) ---
// ==========================================================================

function abrirModalBibliotecaParaBloco(idB) {
  modoGerenciamentoBancoAtivo = false;
  blocoAlvoParaAdicionarExercicio = idB;

  const modalHeader = document.querySelector(
    "#modalBiblioteca .modal-header h3",
  );
  if (modalHeader) {
    modalHeader.innerHTML = `<i class="fa-solid fa-folder-open" style="color: var(--cor-neon);"></i> Selecione o Exercício`;
  }

  let ag = {};
  bibliotecaCompleta.forEach((e) => {
    if (!ag[e.musculo]) ag[e.musculo] = [];
    ag[e.musculo].push(e);
  });
  document.getElementById("modalBodyPastas").innerHTML = Object.keys(ag)
    .map(
      (m, i) => `
        <div class="pasta-musculo" onclick="alternarAcordeaoPasta('p_ex_${i}')"><i class="fa-solid fa-folder" style="color:#f59e0b;"></i> ${m} (${ag[m].length})</div>
        <div class="lista-exercicios-pasta" id="p_ex_${i}">
          <div class="lista-exercicios-pasta-inner">
            ${ag[m].map((ex) => `<div class="item-exercicio-biblioteca" onclick="injetarExercicio('${ex.nome_exercicio}','${ex.gif_url}')">${ex.nome_exercicio} <i class="fa-solid fa-plus" style="color:var(--verde);"></i></div>`).join("")}
          </div>
        </div>`,
    )
    .join("");
  document.getElementById("modalBiblioteca").style.display = "flex";
}

function fecharModalBiblioteca() {
  document.getElementById("modalBiblioteca").style.display = "none";
  modoGerenciamentoBancoAtivo = false;
}

function injetarExercicio(n, g) {
  let b = dadosDoAluno.rotinasTreino.find(
    (x) => x.idBloco === blocoAlvoParaAdicionarExercicio,
  );
  if (b)
    b.exercicios.push({
      id: "ex_" + Date.now(),
      nome: n,
      series: "4",
      reps: "10",
      descanso: '60"',
      gif_url: g,
    });
  fecharModalBiblioteca();
  renderizarModoTreinador();
}

function abrirModalAlimentosParaRefeicao(diaIdx, refIdx) {
  modoGerenciamentoBancoAtivo = false;
  dietaAlvoIndices = { diaIdx, refIdx };

  const modalHeader = document.querySelector(
    "#modalAlimentosRef .modal-header h3",
  );
  if (modalHeader) {
    modalHeader.innerHTML = `<i class="fa-solid fa-basket-shopping" style="color: var(--cor-neon);"></i> Selecione o Alimento por Macro`;
  }

  let ag = { Carbo: [], Proteína: [], Gordura: [] };
  bibliotecaAlimentosCompleta.forEach((al) => {
    let cat = al.tipo_macro || "Carbo";
    if (ag[cat]) ag[cat].push(al);
  });
  document.getElementById("modalBodyPastasAlimentos").innerHTML = Object.keys(
    ag,
  )
    .map(
      (macro, i) => `
        <div class="pasta-musculo" onclick="alternarAcordeaoPasta('p_al_${i}')">
            <i class="fa-solid fa-folder" style="color:#10b981;"></i> Pasta de ${macro} (${ag[macro].length})
        </div>
        <div class="lista-exercicios-pasta" id="p_al_${i}">
          <div class="lista-exercicios-pasta-inner">
            ${ag[macro]
              .map(
                (al) => `
                <div class="item-exercicio-biblioteca" onclick="injetarAlimentoReferencia(${al.id})">
                    <span>${al.nome_alimento} <small style="color:var(--texto-mutado);">(${al.quantidade_padrao}g)</small></span>
                    <i class="fa-solid fa-circle-plus" style="color:var(--cor-neon);"></i>
                </div>`,
              )
              .join("")}
          </div>
        </div>`,
    )
    .join("");
  document.getElementById("modalAlimentosRef").style.display = "flex";
}

function fecharModalAlimentosRef() {
  document.getElementById("modalAlimentosRef").style.display = "none";
  modoGerenciamentoBancoAtivo = false;
}

function injetarAlimentoReferencia(alimentoId) {
  const al = bibliotecaAlimentosCompleta.find((item) => item.id === alimentoId);
  if (!al) return;

  const { diaIdx, refIdx } = dietaAlvoIndices;
  if (diaIdx !== null && refIdx !== null) {
    dadosDoAluno.rotinasDieta[diaIdx].refeicoes[refIdx].alimentos.push({
      id: "al_" + Date.now(),
      nome: al.nome_alimento,
      quantidade: al.quantidade_padrao,
      carboTotal: al.carbo_padrao,
      protTotal: al.prot_padrao,
      gordTotal: al.gord_padrao,
      kcalTotal: al.kcal_padrao,
      porcaoBase: al.quantidade_padrao,
      carboBase: al.carbo_padrao,
      protBase: al.prot_padrao,
      gordBase: al.gord_padrao,
    });
  }
  fecharModalAlimentosRef();
  renderizarModoTreinador();
}

// ==========================================================================
// --- SINCRONIZAÇÃO FINAL COM O BANCO DE DADOS ---
// ==========================================================================

async function salvarAlteracoesNoBanco() {
  if (!alunoIdSelecionado) return;
  alert("Sincronizando dados...");

  await _supabase
    .from("treinos_blocos")
    .delete()
    .eq("aluno_id", alunoIdSelecionado);
  for (let [i, b] of dadosDoAluno.rotinasTreino.entries()) {
    let { data: nb } = await _supabase
      .from("treinos_blocos")
      .insert({
        aluno_id: alunoIdSelecionado,
        nome_bloco: b.nomeBloco,
        ordem: i,
      })
      .select()
      .single();
    if (nb && b.exercicios.length > 0) {
      await _supabase.from("treinos_exercicios").insert(
        b.exercicios.map((e, idx) => ({
          bloco_id: nb.id,
          nome: e.nome,
          series: e.series,
          reps: e.reps,
          descanso: e.descanso,
          gif_url: e.gif_url,
          ordem: idx,
        })),
      );
    }
  }

  await _supabase
    .from("dieta_dias")
    .delete()
    .eq("aluno_id", alunoIdSelecionado);
  for (let [i, d] of dadosDoAluno.rotinasDieta.entries()) {
    let { data: nd } = await _supabase
      .from("dieta_dias")
      .insert({ aluno_id: alunoIdSelecionado, nome_dia: d.nomeDia, ordem: i })
      .select()
      .single();
    if (nd) {
      let inserts = [];
      d.refeicoes.forEach((r) => {
        r.alimentos.forEach((al) => {
          let q = al.quantidade || 1;
          inserts.push({
            dia_id: nd.id,
            nome_refeicao: r.nomeRefeicao,
            nome_alimento: al.nome,
            quantidade: q,
            carbo_g: al.carboTotal / q,
            prot_g: al.protTotal / q,
            gord_g: al.gordTotal / q,
            kcal_g: al.kcalTotal / q,
          });
        });
      });
      if (inserts.length > 0)
        await _supabase.from("dieta_alimentos").insert(inserts);
    }
  }
  alert("Salvo com sucesso!");
  document.getElementById("btnEditar").click();
  await puxarDadosDoAlunoDoBanco();
}

function trocarAlunoNoPainel(id) {
  alunoIdSelecionado = id;
  puxarDadosDoAlunoDoBanco();
}

function configureAbas() {
  document.querySelectorAll(".menu-abas .aba-link").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".menu-abas .aba-link")
        .forEach((b) => b.classList.remove("ativa"));
      document
        .querySelectorAll(".conteudo-aba")
        .forEach((c) => c.classList.remove("ativa"));
      btn.classList.add("ativa");
      document.getElementById(btn.dataset.aba).classList.add("ativa");
      renderizarInterface();
    });
  });
}

// ==========================================================================
// --- EVENT LISTENERS GERAIS ---
// ==========================================================================

document
  .getElementById("btn-novo-bloco-treino")
  .addEventListener("click", () => {
    dadosDoAluno.rotinasTreino.push({
      idBloco: "n_" + Date.now(),
      nomeBloco: "Novo Bloco Treino",
      exercicios: [],
    });
    renderizarModoTreinador();
  });

document.getElementById("btn-novo-dia-dieta").addEventListener("click", () => {
  dadosDoAluno.rotinasDieta.push({
    idDia: "nd_" + Date.now(),
    nomeDia: "Novo Protocolo",
    refeicoes: [],
  });
  renderizarModoTreinador();
});

document.getElementById("btnEditar").addEventListener("click", () => {
  modoEdicaoAtivo = !modoEdicaoAtivo;
  const btn = document.getElementById("btnEditar");
  const idsBotoesAdmin = [
    "btnSalvar",
    "btnGerenciarAlunos",
    "btn-novo-bloco-treino",
    "btn-novo-dia-dieta",
  ];

  if (modoEdicaoAtivo) {
    btn.innerHTML = '<i class="fa-solid fa-xmark"></i> Sair da Edição';
    btn.style.background = "#4b5563";
    idsBotoesAdmin.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = "flex";
    });
    document
      .querySelectorAll(".btn-admin-acao")
      .forEach((el) => (el.style.display = "flex"));
    renderizarModoTreinador();
  } else {
    btn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Ativar Edição';
    btn.style.background = "#3b82f6";
    idsBotoesAdmin.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    });
    document
      .querySelectorAll(".btn-admin-acao")
      .forEach((el) => (el.style.display = "none"));
    renderizarModoAluno();
  }
});
