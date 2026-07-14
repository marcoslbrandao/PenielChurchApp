// Versículo do dia — lista curada, com rotação automática e diária.
// A mesma lista é usada na Home e na Bíblia, então o versículo é sempre
// idêntico nas duas telas. A troca acontece à meia-noite no horário do
// Reino Unido (bem antes das 3h), calculada a partir do "dia do ano".
//
// Cada versículo tem o texto em português, inglês, espanhol e francês, para
// acompanhar o idioma escolhido pelo usuário no app (Perfil > Idioma). Os
// textos em EN/ES/FR usam traduções de domínio público (KJV, Reina-Valera e
// Louis Segond), coerentes com as versões já oferecidas na Bíblia completa.

import { livrosAT, livrosNT } from './bibliaLivros';

export type LangKey = 'pt' | 'en' | 'es' | 'fr';

export type VersiculoDia = {
  /** Referência canônica em português (ex: "Jeremias 29:11") — usada internamente para localizar o livro/capítulo. */
  ref: string;
  pt: string;
  en: string;
  es: string;
  fr: string;
};

/** Sigla da versão bíblica usada em cada idioma, exibida ao lado da referência. */
export const VERSAO_POR_IDIOMA: Record<LangKey, string> = { pt: 'NVI', en: 'KJV', es: 'RVR', fr: 'LSG' };

export const VERSICULOS: VersiculoDia[] = [
  { ref: 'Jeremias 29:11', pt: 'Porque eu sei os planos que tenho para vocês, diz o Senhor, planos de prosperidade e não de calamidade, para dar a vocês esperança e um futuro.', en: 'For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.', es: 'Porque yo sé los pensamientos que tengo acerca de vosotros, dice Jehová, pensamientos de paz, y no de mal, para daros el fin que esperáis.', fr: "Car je connais les projets que j'ai formés sur vous, dit l'Éternel, projets de paix et non de malheur, afin de vous donner un avenir et de l'espérance." },
  { ref: 'Filipenses 4:13', pt: 'Tudo posso naquele que me fortalece.', en: 'I can do all things through Christ which strengtheneth me.', es: 'Todo lo puedo en Cristo que me fortalece.', fr: 'Je puis tout par celui qui me fortifie.' },
  { ref: 'Salmos 23:1', pt: 'O Senhor é o meu pastor; de nada terei falta.', en: 'The LORD is my shepherd; I shall not want.', es: 'Jehová es mi pastor; nada me faltará.', fr: 'L’Éternel est mon berger: je ne manquerai de rien.' },
  { ref: 'Salmos 37:5', pt: 'Entrega o teu caminho ao Senhor; confia nele, e o mais ele fará.', en: 'Commit thy way unto the LORD; trust also in him; and he shall bring it to pass.', es: 'Encomienda a Jehová tu camino, y confía en él; y él hará.', fr: 'Recommande ton sort à l’Éternel, mets en lui ta confiance, et il agira.' },
  { ref: 'Isaías 41:10', pt: 'Não temas, porque eu sou contigo; não te assombres, porque eu sou o teu Deus; eu te fortaleço, e te ajudo, e te sustento com a destra da minha justiça.', en: 'Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee; yea, I will uphold thee with the right hand of my righteousness.', es: 'No temas, porque yo estoy contigo; no desmayes, porque yo soy tu Dios que te esfuerzo; siempre te ayudaré, siempre te sustentaré con la diestra de mi justicia.', fr: 'Ne crains rien, car je suis avec toi; ne promène pas des regards inquiets, car je suis ton Dieu; je te fortifie, je viens à ton secours, je te soutiens de ma droite triomphante.' },
  { ref: 'João 3:16', pt: 'Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito, para que todo aquele que nele crê não pereça, mas tenha a vida eterna.', en: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.', es: 'Porque de tal manera amó Dios al mundo, que ha dado a su Hijo unigénito, para que todo aquel que en él cree, no se pierda, mas tenga vida eterna.', fr: 'Car Dieu a tant aimé le monde qu’il a donné son Fils unique, afin que quiconque croit en lui ne périsse point, mais qu’il ait la vie éternelle.' },
  { ref: 'Eclesiastes 3:1', pt: 'Tudo tem o seu tempo determinado, e há tempo para todo propósito debaixo do céu.', en: 'To every thing there is a season, and a time to every purpose under the heaven.', es: 'Todo tiene su tiempo, y todo lo que se quiere debajo del cielo tiene su hora.', fr: 'Il y a un temps pour toute chose, et un temps pour toute affaire sous les cieux.' },
  { ref: 'Provérbios 3:5', pt: 'Confia no Senhor de todo o teu coração e não te apoies no teu próprio entendimento.', en: 'Trust in the LORD with all thine heart; and lean not unto thine own understanding.', es: 'Fíate de Jehová de todo tu corazón, y no te apoyes en tu propia prudencia.', fr: 'Confie-toi en l’Éternel de tout ton cœur, et ne t’appuie pas sur ta sagesse.' },
  { ref: 'Deuteronômio 31:6', pt: 'Sede fortes e corajosos; não temais, nem vos atemorizeis diante deles, porque o Senhor teu Deus é o que vai contigo; não te deixará, nem te desamparará.', en: 'Be strong and of a good courage, fear not, nor be afraid of them: for the LORD thy God, he it is that doth go with thee; he will not fail thee, nor forsake thee.', es: 'Esforzaos y cobrad ánimo; no temáis, ni tengáis miedo de ellos: que Jehová tu Dios es el que va contigo; no te dejará ni te desamparará.', fr: 'Fortifiez-vous et ayez du courage! Ne craignez point et ne soyez point effrayés devant eux; car l’Éternel, ton Dieu, marchera lui-même avec toi, il ne te délaissera point, il ne t’abandonnera point.' },
  { ref: 'Filipenses 4:4', pt: 'Alegrai-vos sempre no Senhor; outra vez digo, alegrai-vos.', en: 'Rejoice in the Lord alway: and again I say, Rejoice.', es: 'Regocijaos en el Señor siempre. Otra vez digo: Regocijaos.', fr: 'Réjouissez-vous toujours dans le Seigneur; je le répète, réjouissez-vous.' },
  { ref: 'Salmos 27:1', pt: 'O Senhor é a minha luz e a minha salvação; a quem temerei?', en: 'The LORD is my light and my salvation; whom shall I fear?', es: 'Jehová es mi luz y mi salvación; ¿de quién temeré?', fr: 'L’Éternel est ma lumière et mon salut: de qui aurais-je crainte?' },
  { ref: 'Mateus 11:28', pt: 'Vinde a mim, todos os que estais cansados e oprimidos, e eu vos aliviarei.', en: 'Come unto me, all ye that labour and are heavy laden, and I will give you rest.', es: 'Venid a mí todos los que estáis trabajados y cargados, y yo os haré descansar.', fr: 'Venez à moi, vous tous qui êtes fatigués et chargés, et je vous donnerai du repos.' },
  { ref: 'Mateus 6:33', pt: 'Buscai primeiro o Reino de Deus, e a sua justiça, e todas essas coisas vos serão acrescentadas.', en: 'But seek ye first the kingdom of God, and his righteousness; and all these things shall be added unto you.', es: 'Mas buscad primeramente el reino de Dios y su justicia, y todas estas cosas os serán añadidas.', fr: 'Cherchez premièrement le royaume et la justice de Dieu; et toutes ces choses vous seront données par-dessus.' },
  { ref: '2 Coríntios 5:17', pt: 'Portanto, se alguém está em Cristo, é nova criatura; as coisas antigas já passaram; eis que tudo se fez novo.', en: 'Therefore if any man be in Christ, he is a new creature: old things are passed away; behold, all things are become new.', es: 'De modo que si alguno está en Cristo, nueva criatura es; las cosas viejas pasaron; he aquí todas son hechas nuevas.', fr: 'Si quelqu’un est en Christ, il est une nouvelle création. Les choses anciennes sont passées; voici, toutes choses sont devenues nouvelles.' },
  { ref: 'Filipenses 4:6', pt: 'Não andeis ansiosos por coisa alguma; em tudo, porém, sejam conhecidas, diante de Deus, as vossas petições, pela oração e súplicas, com ações de graças.', en: 'Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God.', es: 'Por nada estéis afanosos, sino sean conocidas vuestras peticiones delante de Dios en toda oración y ruego, con acción de gracias.', fr: 'Ne vous inquiétez de rien; mais en toute chose faites connaître vos besoins à Dieu par des prières et des supplications, avec des actions de grâces.' },
  { ref: 'Números 6:24-25', pt: 'O Senhor te abençoe, e te guarde; o Senhor faça resplandecer o seu rosto sobre ti, e tenha misericórdia de ti.', en: 'The LORD bless thee, and keep thee: The LORD make his face shine upon thee, and be gracious unto thee.', es: 'Jehová te bendiga, y te guarde: Jehová haga resplandecer su rostro sobre ti, y tenga de ti misericordia.', fr: 'Que l’Éternel te bénisse, et qu’il te garde! Que l’Éternel fasse luire sa face sur toi, et qu’il t’accorde sa grâce!' },
  { ref: 'Salmos 31:24', pt: 'Sejam fortes e corajosos, todos vocês que esperam no Senhor.', en: 'Be of good courage, and he shall strengthen your heart, all ye that hope in the LORD.', es: 'Esforzaos todos vosotros los que esperáis en Jehová, y tome aliento vuestro corazón.', fr: 'Fortifiez-vous et que votre cœur s’affermisse, vous tous qui espérez en l’Éternel!' },
  { ref: 'João 8:32', pt: 'E conhecereis a verdade, e a verdade vos libertará.', en: 'And ye shall know the truth, and the truth shall make you free.', es: 'Y conoceréis la verdad, y la verdad os hará libres.', fr: 'vous connaîtrez la vérité, et la vérité vous affranchira.' },
  { ref: '1 Pedro 5:7', pt: 'Lancem sobre ele toda a sua ansiedade, porque ele tem cuidado de vocês.', en: 'Casting all your care upon him; for he careth for you.', es: 'Echando toda vuestra ansiedad sobre él, porque él tiene cuidado de vosotros.', fr: 'et déchargez-vous sur lui de tous vos soucis, car lui-même prend soin de vous.' },
  { ref: 'Lucas 1:37', pt: 'Pois, com Deus, nada é impossível.', en: 'For with God nothing shall be impossible.', es: 'Porque no hay nada imposible para Dios.', fr: 'car rien n’est impossible à Dieu.' },
  { ref: '1 Coríntios 13:4', pt: 'O amor é paciente, o amor é bondoso. Não inveja, não se vangloria, não se orgulha.', en: 'Charity suffereth long, and is kind; charity envieth not; charity vaunteth not itself, is not puffed up.', es: 'El amor es sufrido, es benigno; el amor no tiene envidia, el amor no es jactancioso, no se envanece.', fr: 'La charité est patiente, elle est pleine de bonté; la charité n’est point envieuse; la charité ne se vante point, elle ne s’enfle point d’orgueil.' },
  { ref: 'Salmos 46:10', pt: 'Aquietai-vos, e sabei que eu sou Deus.', en: 'Be still, and know that I am God.', es: 'Estad quietos, y conoced que yo soy Dios.', fr: 'Arrêtez, et sachez que je suis Dieu.' },
  { ref: 'Mateus 6:34', pt: 'Portanto, não andem ansiosos pelo dia de amanhã, pois o amanhã trará as suas próprias ansiedades. Basta a cada dia o seu próprio mal.', en: 'Take therefore no thought for the morrow: for the morrow shall take thought for the things of itself. Sufficient unto the day is the evil thereof.', es: 'Así que, no os afanéis por el día de mañana, que el día de mañana traerá su afán. Basta a cada día su propio mal.', fr: 'Ne vous inquiétez donc pas du lendemain; car le lendemain aura soin de lui-même. A chaque jour suffit sa peine.' },
  { ref: '2 Coríntios 9:15', pt: 'Graças a Deus pelo seu dom inefável!', en: 'Thanks be unto God for his unspeakable gift.', es: 'Gracias a Dios por su don inefable.', fr: 'Grâces soient rendues à Dieu pour son don ineffable!' },
  { ref: 'Salmos 23:4', pt: 'Ainda que eu andasse pelo vale da sombra da morte, não temeria mal algum, porque tu estás comigo.', en: 'Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me.', es: 'Aunque ande en valle de sombra de muerte, no temeré mal alguno, porque tú estarás conmigo.', fr: 'Quand je marche dans la vallée de l’ombre de la mort, je ne crains aucun mal, car tu es avec moi.' },
  { ref: 'Isaías 40:31', pt: 'Mas os que esperam no Senhor renovarão as suas forças, subirão com asas como águias.', en: 'But they that wait upon the LORD shall renew their strength; they shall mount up with wings as eagles; they shall run, and not be weary; and they shall walk, and not faint.', es: 'Pero los que esperan a Jehová tendrán nuevas fuerzas; levantarán alas como las águilas; correrán, y no se cansarán; caminarán, y no se fatigarán.', fr: 'mais ceux qui se confient en l’Éternel renouvellent leur force. Ils prennent le vol comme les aigles; ils courent, et ne se lassent point, ils marchent, et ne se fatiguent point.' },
  { ref: 'Salmos 118:24', pt: 'Este é o dia que o Senhor fez; regozijemo-nos e alegremo-nos nele.', en: 'This is the day which the LORD hath made; we will rejoice and be glad in it.', es: 'Este es el día que hizo Jehová; nos gozaremos y alegraremos en él.', fr: 'C’est ici la journée que l’Éternel a faite: qu’elle soit pour nous un sujet d’allégresse et de joie!' },
  { ref: 'Neemias 8:10', pt: 'A alegria do Senhor é a força de vocês.', en: 'The joy of the LORD is your strength.', es: 'El gozo de Jehová es vuestra fuerza.', fr: 'la joie de l’Éternel sera votre force.' },
  { ref: 'Romanos 8:31', pt: 'Se Deus é por nós, quem será contra nós?', en: 'If God be for us, who can be against us?', es: 'Si Dios es por nosotros, ¿quién contra nosotros?', fr: 'Si Dieu est pour nous, qui sera contre nous?' },
  { ref: 'Salmos 139:23', pt: 'Examina-me, ó Deus, e conhece o meu coração; prova-me, e conhece os meus pensamentos.', en: 'Search me, O God, and know my heart: try me, and know my thoughts.', es: 'Examíname, oh Dios, y conoce mi corazón; pruébame y conoce mis pensamientos.', fr: 'Sonde-moi, ô Dieu, et connais mon cœur! Éprouve-moi, et connais mes pensées!' },
  { ref: 'Salmos 143:10', pt: 'Ensina-me a fazer a tua vontade, pois tu és o meu Deus; guie-me o teu bom Espírito por terreno plano.', en: 'Teach me to do thy will; for thou art my God: thy spirit is good; lead me into the land of uprightness.', es: 'Enséñame a hacer tu voluntad, porque tú eres mi Dios; tu buen espíritu me guíe a tierra de rectitud.', fr: 'Enseigne-moi à faire ta volonté! Car tu es mon Dieu. Que ton bon esprit me conduise sur la voie droite!' },
  { ref: 'Salmos 145:18', pt: 'Perto está o Senhor de todos os que o invocam, de todos os que o invocam em verdade.', en: 'The LORD is nigh unto all them that call upon him, to all that call upon him in truth.', es: 'Cercano está Jehová a todos los que le invocan, a todos los que le invocan de veras.', fr: 'L’Éternel est près de tous ceux qui l’invoquent, de tous ceux qui l’invoquent avec sincérité.' },
  { ref: 'Naum 1:7', pt: 'O Senhor é bom, um refúgio no tempo da angústia; ele protege aqueles que nele confiam.', en: 'The LORD is good, a strong hold in the day of trouble; and he knoweth them that trust in him.', es: 'Bueno es Jehová para fortaleza en el día de la angustia; y conoce a los que en él confían.', fr: 'L’Éternel est bon, il est un refuge au jour de la détresse; il connaît ceux qui se confient en lui.' },
  { ref: 'Isaías 40:29', pt: 'Ele dá força ao cansado e multiplica o vigor daquele que não tem forças.', en: 'He giveth power to the faint; and to them that have no might he increaseth strength.', es: 'Él da esfuerzo al cansado, y multiplica las fuerzas al que no tiene ningunas.', fr: 'Il donne de la force à celui qui est fatigué, et il augmente la vigueur de celui qui tombe en défaillance.' },
  { ref: 'Salmos 37:4', pt: 'Deleita-te também no Senhor, e ele te concederá o que deseja o teu coração.', en: 'Delight thyself also in the LORD; and he shall give thee the desires of thine heart.', es: 'Deléitate asimismo en Jehová, y él te concederá las peticiones de tu corazón.', fr: 'Fais de l’Éternel tes délices, et il te donnera ce que ton cœur désire.' },
  { ref: 'Salmos 103:2', pt: 'Bendiga, ó minha alma, ao Senhor, e não esqueça nenhum dos seus benefícios.', en: 'Bless the LORD, O my soul, and forget not all his benefits.', es: 'Bendice, alma mía, a Jehová, y no olvides ninguno de sus beneficios.', fr: 'Bénis l’Éternel, ô mon âme, et n’oublie aucun de ses bienfaits!' },
  { ref: 'Lucas 1:37', pt: 'Porque para Deus nada é impossível.', en: 'For with God nothing shall be impossible.', es: 'Porque no hay nada imposible para Dios.', fr: 'car rien n’est impossible à Dieu.' },
  { ref: 'Efésios 5:2', pt: 'Cristo, que nos amou e a si mesmo se entregou por nós.', en: 'Christ also loved us, and gave himself for us.', es: 'Cristo nos amó, y se entregó a sí mismo por nosotros.', fr: 'Christ nous a aimés, et s’est livré lui-même pour nous.' },
  { ref: 'Efésios 4:24', pt: 'Portanto, revistam-se da nova natureza, criada para ser semelhante a Deus em justiça e em santidade provenientes da verdade.', en: 'And that ye put on the new man, which after God is created in righteousness and true holiness.', es: 'y vestíos del nuevo hombre, creado según Dios en la justicia y santidad de la verdad.', fr: 'et à revêtir l’homme nouveau, créé selon Dieu dans une justice et une sainteté que produit la vérité.' },
  { ref: 'Salmos 128:1', pt: 'Feliz aquele que teme ao Senhor e anda nos seus caminhos.', en: 'Blessed is every one that feareth the LORD; that walketh in his ways.', es: 'Bienaventurado todo aquel que teme a Jehová, que anda en sus caminos.', fr: 'Heureux tout homme qui craint l’Éternel, qui marche dans ses voies!' },
  { ref: 'Salmos 34:8', pt: 'Provai e vede que o Senhor é bom; feliz é o homem que nele se refugia.', en: 'O taste and see that the LORD is good: blessed is the man that trusteth in him.', es: 'Gustad, y ved que es bueno Jehová: Bienaventurado el hombre que confía en él.', fr: 'Sentez et voyez combien l’Éternel est bon! Heureux l’homme qui cherche en lui son refuge!' },
  { ref: 'Romanos 12:2', pt: 'Não vos amoldeis a este mundo, mas transformai-vos pela renovação da vossa mente.', en: 'And be not conformed to this world: but be ye transformed by the renewing of your mind.', es: 'No os conforméis a este siglo, sino transformaos por medio de la renovación de vuestro entendimiento.', fr: 'Ne vous conformez pas au siècle présent, mais soyez transformés par le renouvellement de l’intelligence.' },
  { ref: 'Salmos 138:8', pt: 'O Senhor cumprirá o seu propósito em mim; a tua benignidade, Senhor, é para sempre.', en: 'The LORD will perfect that which concerneth me: thy mercy, O LORD, endureth for ever.', es: 'Jehová cumplirá su propósito en mí; tu misericordia, oh Jehová, es para siempre.', fr: 'L’Éternel agira en ma faveur. Éternel, ta bonté dure toujours.' },
  { ref: 'Eclesiastes 4:6', pt: 'Mais vale um punhado de descanso do que dois punhados de trabalho, com fadiga e aflição de espírito.', en: 'Better is an handful with quietness, than both the hands full with travail and vexation of spirit.', es: 'Mejor es un puño lleno con descanso, que ambos puños llenos con trabajo y aflicción de espíritu.', fr: 'Mieux vaut une main pleine avec repos, que les deux mains pleines avec travail et poursuite du vent.' },
  { ref: 'Salmos 103:13', pt: 'Assim como o pai se compadece de seus filhos, também o Senhor se compadece daqueles que o temem.', en: 'Like as a father pitieth his children, so the LORD pitieth them that fear him.', es: 'Como el padre se compadece de los hijos, se compadece Jehová de los que le temen.', fr: 'Comme un père a compassion de ses enfants, l’Éternel a compassion de ceux qui le craignent.' },
  { ref: '2 Coríntios 12:9', pt: 'A minha graça é suficiente para você, pois o meu poder se aperfeiçoa na fraqueza.', en: 'My grace is sufficient for thee: for my strength is made perfect in weakness.', es: 'Bástate mi gracia; porque mi poder se perfecciona en la debilidad.', fr: 'Ma grâce te suffit, car ma puissance s’accomplit dans la faiblesse.' },
  { ref: 'Hebreus 13:9', pt: 'Não vos deixem levar por nenhuma espécie de ensinos estranhos, pois é bom que o coração seja fortalecido pela graça.', en: 'Be not carried about with divers and strange doctrines. For it is a good thing that the heart be established with grace.', es: 'No os dejéis llevar de doctrinas diversas y extrañas; porque buena cosa es que el corazón sea afirmado por la gracia.', fr: 'Ne vous laissez pas entraîner par des doctrines diverses et étrangères; car il est bon que le cœur soit affermi par la grâce.' },
  { ref: 'Hebreus 4:12', pt: 'A palavra de Deus é viva e eficaz, e mais cortante do que qualquer espada de dois gumes.', en: 'For the word of God is quick, and powerful, and sharper than any twoedged sword.', es: 'Porque la palabra de Dios es viva y eficaz, y más cortante que toda espada de dos filos.', fr: 'Car la parole de Dieu est vivante et efficace, plus tranchante qu’aucune épée à deux tranchants.' },
  { ref: 'Salmos 119:105', pt: 'A tua palavra é lâmpada para os meus pés e luz para o meu caminho.', en: 'Thy word is a lamp unto my feet, and a light unto my path.', es: 'Lámpara es a mis pies tu palabra, y lumbrera a mi camino.', fr: 'Ta parole est une lampe à mes pieds, et une lumière sur mon sentier.' },
  { ref: '2 Timóteo 3:16', pt: 'Toda a Escritura é inspirada por Deus e útil para o ensino, para a repreensão, para a correção e para a instrução na justiça.', en: 'All scripture is given by inspiration of God, and is profitable for doctrine, for reproof, for correction, for instruction in righteousness.', es: 'Toda la Escritura es inspirada por Dios, y útil para enseñar, para redargüir, para corregir, para instruir en justicia.', fr: 'Toute Écriture est inspirée de Dieu, et utile pour enseigner, pour convaincre, pour corriger, pour instruire dans la justice.' },
];

/**
 * Retorna o "dia do ano" (0–365) a partir da data local do aparelho.
 * Evita Intl/toLocaleString com fuso horário — o motor Hermes usado em
 * produção não suporta bem essa API e retornava "Invalid Date" (o que
 * deixava o versículo do dia em branco). Como o app é majoritariamente
 * usado no Reino Unido, a data local do aparelho já é uma proxy confiável
 * o suficiente para "muda todo dia à meia-noite".
 */
function diaDoAno(): number {
  const agora = new Date();
  const inicioAno = new Date(agora.getFullYear(), 0, 0);
  const diffMs = agora.getTime() - inicioAno.getTime();
  return Math.floor(diffMs / 86400000);
}

/** Versículo do dia — muda automaticamente à meia-noite (horário local). */
export function getVersiculoDoDia(): VersiculoDia {
  const dia = diaDoAno();
  const indice = ((dia % VERSICULOS.length) + VERSICULOS.length) % VERSICULOS.length;
  return VERSICULOS[indice] ?? VERSICULOS[0];
}

/**
 * Extrai o nome do livro e o capítulo de uma referência como "Eclesiastes 4:6"
 * ou "Números 6:24-25", para permitir abrir o capítulo inteiro no leitor.
 * Retorna null se o formato não for reconhecido.
 */
export function parseReferencia(ref: string): { livroNome: string; capitulo: number } | null {
  const ultimoEspaco = ref.lastIndexOf(' ');
  if (ultimoEspaco === -1) return null;
  const livroNome = ref.slice(0, ultimoEspaco).trim();
  const capVer = ref.slice(ultimoEspaco + 1).trim();
  const capitulo = parseInt(capVer.split(':')[0], 10);
  if (!livroNome || isNaN(capitulo)) return null;
  return { livroNome, capitulo };
}

function langKeyValida(lang: string): LangKey {
  return (lang === 'en' || lang === 'es' || lang === 'fr') ? lang : 'pt';
}

/** Texto do versículo no idioma atual do app (cai para português se faltar tradução). */
export function getTextoVersiculo(v: VersiculoDia, lang: string): string {
  const key = langKeyValida(lang);
  return v[key] || v.pt;
}

/** Sigla da versão bíblica correspondente ao idioma atual do app. */
export function getVersaoVersiculo(lang: string): string {
  return VERSAO_POR_IDIOMA[langKeyValida(lang)];
}

/** Referência bíblica (nome do livro + capítulo:versículo) no idioma atual do app. */
export function getReferenciaVersiculo(v: VersiculoDia, lang: string): string {
  const key = langKeyValida(lang);
  if (key === 'pt') return v.ref;
  const ultimoEspaco = v.ref.lastIndexOf(' ');
  if (ultimoEspaco === -1) return v.ref;
  const livroNome = v.ref.slice(0, ultimoEspaco).trim();
  const capVer = v.ref.slice(ultimoEspaco + 1).trim();
  const livro = [...livrosAT, ...livrosNT].find(l => l.pt === livroNome);
  if (!livro) return v.ref;
  return `${livro[key]} ${capVer}`;
}
