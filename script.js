const SUPABASE_URL = 'https://wtaluaiatlguefgwuuxy.supabase.co'; 
        const SUPABASE_KEY = 'sb_publishable_XWA4yh4y8ShcWjg88jfKlg_YYNbFX2g'; 
        const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

        let dadosDoAluno = { rotinasTreino: [], rotinasDieta: [] };
        let alunoIdSelecionado = "";
        let idExercicioComGifAberto = null;
        
        // Objeto global para armazenar os arquivos de imagem capturados
        let arquivosFotos = {
            frente: null,
            lado_esq: null,
            costas: null,
            lado_dir: null
        };

        window.onload = async function() {
            const urlParams = new URLSearchParams(window.location.search);
            alunoIdSelecionado = urlParams.get('id');

            if(!alunoIdSelecionado) {
                document.body.innerHTML = `<div style="text-align:center; padding:50px; color:var(--texto-mutado);">
                    <h2>Acesso Restrito</h2><p style="margin-top:10px;">Por favor, utilize o link direto fornecido pelo seu treinador.</p>
                </div>`;
                return;
            }

            await puxarDadosDoAlunoDoBanco();
            configureTabs();
        };

        async function puxarDadosDoAlunoDoBanco() {
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
                                carboTotal: Number((al.carbo_g * q).toFixed(1)), protTotal: Number((al.prot_g * q).toFixed(1)), gordTotal: Number((al.gord_g * q).toFixed(1)), kcalTotal: Number((al.kcal_g * q).toFixed(0))
                            });
                        });
                    }
                    dietas.push({ idDia: d.id, nomeDia: d.nome_dia, refeicoes: Object.values(refs) });
                }
            }

            dadosDoAluno.rotinasTreino = treinos;
            dadosDoAluno.rotinasDieta = dietas;
            renderizarModoAluno();
        }

        function renderizarModoAluno() {
            document.getElementById('container-blocos-treino').innerHTML = dadosDoAluno.rotinasTreino.map(b => `
                <div class="bloco-secao" id="${b.idBloco}">
                    <div class="header-bloco" onclick="alternarBlocoLayout('${b.idBloco}', 'treino')">
                        <div class="titulo-secao">${b.nomeBloco} <i class="fa-solid fa-chevron-down seta-recolher"></i></div>
                    </div>
                    <div class="corpo-recolhivel">
                        <table>
                            <thead><tr><th>Exercício</th><th>Séries</th><th>Reps</th><th>Desc.</th></tr></thead>
                            <tbody>
                                ${b.exercicios.map(ex => `
                                    <tr id="linha-ex-${ex.id}">
                                        <td style="color:var(--cor-neon); cursor:pointer;" onclick="gerenciarIframeInjetado('${ex.id}', '${ex.gif_url}')">
                                            <i class="fa-solid fa-play-circle" style="margin-right:5px;"></i>${ex.nome}
                                        </td>
                                        <td>${ex.series}</td>
                                        <td>${ex.reps}</td>
                                        <td>${ex.descanso}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `).join('');

            if(dadosDoAluno.rotinasDieta.length === 0) {
                document.getElementById('conteudo-refeicoes-dinamicas').innerHTML = '<p style="text-align:center; padding:20px; color:var(--texto-mutado);">Nenhum protocolo ativo de dieta encontrado.</p>';
            } else {
                document.getElementById('conteudo-refeicoes-dinamicas').innerHTML = dadosDoAluno.rotinasDieta.map(dia => {
                    let diaKcal = 0, diaCarbo = 0, diaProt = 0, diaGord = 0;
                    dia.refeicoes.forEach(ref => {
                        ref.alimentos.forEach(al => {
                            diaKcal += al.kcalTotal; diaCarbo += al.carboTotal; diaProt += al.protTotal; diaGord += al.gordTotal;
                        });
                    });

                    let htmlRefeicoesInternas = dia.refeicoes.map(ref => {
                        let refKcal = 0, refCarbo = 0, refProt = 0, refGord = 0;
                        let lines = ref.alimentos.map(al => {
                            refKcal += al.kcalTotal; refCarbo += al.carboTotal; refProt += al.protTotal; refGord += al.gordTotal;
                            return `<tr><td>${al.nome}</td><td>${al.quantidade}</td><td style="font-size:12px; color:var(--texto-mutado);">${Math.round(al.carboTotal)} C / ${Math.round(al.protTotal)} P / ${Math.round(al.gordTotal)} G</td></tr>`;
                        }).join('');

                        return `
                            <div class="bloco-refeicao-interno">
                                <div class="titulo-refeicao-interna">
                                    <span>${ref.nomeRefeicao}</span>
                                    <span style="color: var(--cor-neon); font-size:13px;">${Math.round(refKcal)} Kcal</span>
                                </div>
                                <table>
                                    <thead><tr><th>Alimento</th><th>Qtd</th><th>Macros</th></tr></thead>
                                    <tbody>${lines}</tbody>
                                </table>
                            </div>
                        `;
                    }).join('');

                    return `
                        <div class="bloco-secao" id="${dia.idDia}">
                            <div class="header-bloco" onclick="alternarBlocoLayout('${dia.idDia}', 'dieta')">
                                <div class="titulo-secao">
                                    ${dia.nomeDia} 
                                    <span style="font-size:13px; color:var(--cor-neon); margin-left:auto; margin-right:12px; font-weight:bold;">
                                        Total: ${Math.round(diaKcal)} Kcal
                                    </span> 
                                    <i class="fa-solid fa-chevron-down seta-recolher"></i>
                                </div>
                            </div>
                            <div class="corpo-recolhivel">
                                ${htmlRefeicoesInternas}
                                <div class="resumo-macros">
                                    <div class="macro-box"><p>Kcal Dia</p><div style="color:var(--cor-neon);">${Math.round(diaKcal)}</div></div>
                                    <div class="macro-box"><p>Carbo</p><div>${Math.round(diaCarbo)}</div></div>
                                    <div class="macro-box"><p>Prot</p><div>${Math.round(diaProt)}</div></div>
                                    <div class="macro-box"><p>Gord</p><div>${Math.round(diaGord)}</div></div>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

        function alternarBlocoLayout(id, tipoAba) {
            const elClicado = document.getElementById(id);
            if (!elClicado) return;

            const containerPaiId = tipoAba === 'treino' ? 'container-blocos-treino' : 'conteudo-refeicoes-dinamicas';
            const todosOsBlocos = document.getElementById(containerPaiId).querySelectorAll('.bloco-secao');
            const jaEstavaExpandido = elClicado.classList.contains('expandido');

            if (tipoAba === 'treino') {
                removerLinhaGifComAnimacao();
                idExercicioComGifAberto = null;
            }

            todosOsBlocos.forEach(bloco => { bloco.classList.remove('expandido'); });

            if (!jaEstavaExpandido) {
                elClicado.classList.add('expandido');
                setTimeout(() => { elClicado.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 150);
            }
        }

        function gerenciarIframeInjetado(exId, url) {
            const staticLine = document.getElementById(`linha-ex-${exId}`);
            if (!staticLine) return;

            // 1. Se clicou no MESMO exercício que já está aberto, fecha com animação
            if (idExercicioComGifAberto === exId) {
                removerLinhaGifComAnimacao();
                idExercicioComGifAberto = null;
                return;
            }

            const linhaExistente = document.getElementById('linha-gif-dinamica');

            // 2. Se já existe um GIF aberto (outro exercício), faz a transição fluida
            if (linhaExistente) {
                const wrapperAnitgo = document.getElementById('wrapper-gif-elemento');
                if (wrapperAnitgo) {
                    // Remove a classe ativa para iniciar o fade out / encolhimento do atual
                    wrapperAnitgo.classList.remove('ativo');
                    
                    // Aguarda o fade out terminar (400ms) antes de mover e carregar o novo GIF
                    setTimeout(() => {
                        // Move a linha existente para logo após o novo exercício clicado
                        staticLine.parentNode.insertBefore(linhaExistente, staticLine.nextSibling);
                        
                        // Atualiza o iframe com a nova URL
                        wrapperAnitgo.innerHTML = `<iframe src="${url}" allow="autoplay"></iframe>`;
                        
                        // Força o gatilho da nova animação de abertura (fade in)
                        setTimeout(() => {
                            wrapperAnitgo.classList.add('ativo');
                        }, 50);
                    }, 400); // Tempo exato da transição CSS do seu style
                }
                idExercicioComGifAberto = exId;
                return;
            }

            // 3. Se NÃO havia nenhum GIF aberto, cria e abre do zero normalmente
            const novaLinha = document.createElement('tr');
            novaLinha.id = 'linha-gif-dinamica';
            novaLinha.className = 'linha-gif-exercicio';
            novaLinha.innerHTML = `
                <td colspan="4">
                    <div class="wrapper-gif-dinamico" id="wrapper-gif-elemento">
                        <iframe src="${url}" allow="autoplay"></iframe>
                    </div>
                </td>
            `;

            staticLine.parentNode.insertBefore(novaLinha, staticLine.nextSibling);
            idExercicioComGifAberto = exId;

            setTimeout(() => {
                const wrapper = document.getElementById('wrapper-gif-elemento');
                if (wrapper) wrapper.classList.add('ativo');
            }, 50);
        }

        function removerLinhaGifComAnimacao() {
            const linhaExistente = document.getElementById('linha-gif-dinamica');
            const wrapper = document.getElementById('wrapper-gif-elemento');
            if (linhaExistente && wrapper) {
                wrapper.classList.remove('ativo');
                linhaExistente.id = 'linha-gif-deletando';
                setTimeout(() => { linhaExistente.remove(); }, 400);
            }
        }

        function configureTabs() {
            document.querySelectorAll('.menu-abas .aba-link').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.menu-abas .aba-link').forEach(b => b.classList.remove('ativa'));
                    document.querySelectorAll('.conteudo-aba').forEach(c => c.classList.remove('ativa'));
                    btn.classList.add('ativa'); 
                    document.getElementById(btn.dataset.aba).classList.add('ativa');
                    removerLinhaGifComAnimacao();
                    idExercicioComGifAberto = null;
                });
            });
        }

        function capturarPreviewMultiplo(input, posicao) {
            const file = input.files[0];
            const preview = document.getElementById(`preview-${posicao}`);
            const statusText = document.getElementById(`status-${posicao}`);
            
            if (file) {
                arquivosFotos[posicao] = file;
                const reader = new FileReader();
                reader.onload = function(e) {
                    preview.src = e.target.result;
                    preview.style.display = 'block';
                    statusText.innerText = "Selecionada ✓";
                    statusText.style.color = "var(--cor-neon)";
                }
                reader.readAsDataURL(file);
            }
        }

        async function enviarFeedbackCompleto() {
            const texto = document.getElementById('feedback-texto').value.trim();
            const btn = document.getElementById('btn-enviar-feedback');
            
            if(!texto) return alert("Por favor, preencha o seu comentário semanal.");
            
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando Relatório...';

            let urlsGeradas = { frente: null, lado_esq: null, costas: null, lado_dir: null };

            for (let posicao in arquivosFotos) {
                if (arquivosFotos[posicao]) {
                    try {
                        const fileObj = arquivosFotos[posicao];
                        const extensao = fileObj.name.split('.').pop();
                        const nomeArquivo = `${alunoIdSelecionado}/${Date.now()}_${posicao}.${extensao}`;

                        let { error: uploadError } = await _supabase.storage
                            .from('fotos-evolucao')
                            .upload(nomeArquivo, fileObj);

                        if (uploadError) throw uploadError;
                        
                        urlsGeradas[posicao] = `${SUPABASE_URL}/storage/v1/object/public/fotos-evolucao/${nomeArquivo}`;
                    } catch (uploadErr) {
                        console.error(`Erro no upload da foto (${posicao}):`, uploadErr);
                    }
                }
            }

            try {
                const { error: insertError } = await _supabase
                    .from('feedbacks_alunos')
                    .insert({
                        aluno_id: alunoIdSelecionado,
                        comentario: texto,
                        foto_url: urlsGeradas.frente,
                        foto_lado_esq: urlsGeradas.lado_esq,
                        foto_costas: urlsGeradas.costas,
                        foto_lado_dir: urlsGeradas.lado_dir
                    });

                if (insertError) throw insertError;

                alert("Boa, o relatório com as fotos foi enviado com sucesso! O gorila tá evoluindo! 🦍");
                
                document.getElementById('feedback-texto').value = "";
                arquivosFotos = { frente: null, lado_esq: null, costas: null, lado_dir: null };
                
                const posicoes = ['frente', 'lado_esq', 'costas', 'lado_dir'];
                posicoes.forEach(p => {
                    document.getElementById(`preview-${p}`).style.display = 'none';
                    const st = document.getElementById(`status-${p}`);
                    st.innerText = "Toque p/ selecionar";
                    st.style.color = "var(--texto-mutado)";
                });

            } catch (err) {
                console.error("Erro final no banco de dados:", err);
                alert("Ocorreu um erro ao registrar as informações no banco de dados. Tente novamente.");
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Enviar Atualização 🦍';
            }
        }