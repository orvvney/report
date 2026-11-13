<script setup>
import { onBeforeUnmount, onMounted, watch } from 'vue';
import addAccountImage from '../../images/authenticator-add-account.png';
import scanCodeImage from '../../images/authenticator-scan-code.jpg';
import codeImage from '../../images/authenticator-code.png';
import setupKeyImage from '../../images/authenticator-setup-key.png';

const props = defineProps({ open: Boolean, issuer: { type: String, required: true } });
const emit = defineEmits(['close']);
// Диалог занимает весь экран: прокрутка отчёта под ним отключается.
watch(() => props.open, (open) => { document.body.style.overflow = open ? 'hidden' : ''; });
function keydown(event) { if (event.key === 'Escape' && props.open) emit('close'); }
function backdrop(event) { if (event.target === event.currentTarget) emit('close'); }
onMounted(() => document.addEventListener('keydown', keydown));
onBeforeUnmount(() => { document.removeEventListener('keydown', keydown); document.body.style.overflow = ''; });
</script>

<template>
  <div id="login-guide" class="guide-overlay" :hidden="!open" @click="backdrop">
    <section class="guide-dialog" role="dialog" aria-modal="true" aria-labelledby="guide-title">
      <header class="guide-header">
        <div><span>Քայլ առ քայլ ուղեցույց</span><h2 id="guide-title">Ինչպե՞ս մուտք գործել</h2></div>
        <button id="close-login-guide" class="guide-close" type="button" aria-label="Փակել ուղեցույցը" @click="emit('close')">×</button>
      </header>
      <div class="guide-body">
        <section class="guide-intro">
          <strong>Նախքան սկսելը</strong>
          <p>Հեռախոսում տեղադրեք <b>Google Authenticator</b> հավելվածը։ Համակարգչով բացված այս էջը մի փակեք, մինչև մուտքն ավարտեք։</p>
          <div class="store-links"><a href="https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2" target="_blank" rel="noopener noreferrer">Ներբեռնել Android-ի համար</a><a href="https://apps.apple.com/app/google-authenticator/id388497605" target="_blank" rel="noopener noreferrer">Ներբեռնել iPhone-ի համար</a></div>
        </section>

        <section class="guide-important">
          <div class="guide-important-icon" aria-hidden="true">!</div>
          <div><strong>Կարևոր է ճիշտ Account-ն ու հեռախոսն ընտրել</strong><ul><li>Google Authenticator հավելվածում մուտք գործեք <b>նույն Google Account-ով</b>, որով մուտք եք գործել այս ծրագիր։</li><li>Կարգավորումը կատարեք ձեր <b>անձնական հեռախոսով</b> կամ այն հեռախոսով, որը մշտապես ձեզ մոտ է և հասանելի է միայն ձեզ։</li><li><b>Ամեն անգամ ծրագիր մուտք գործելիս</b> պետք է բացեք Google Authenticator-ը և կայքում գրեք այդ պահին ցուցադրվող 6-նիշ կոդը։ Կոդը պարբերաբար փոխվում է, ուստի օգտագործեք տվյալ պահին երևացող կոդը։</li></ul></div>
        </section>

        <article class="guide-step guide-step-text">
          <div class="guide-number">1</div>
          <div><h3>QR կոդը բաց պահեք և վերցրեք ձեր անձնական հեռախոսը</h3><p>Դուք արդեն մուտք եք գործել Google հաշվով, և կայքում ցուցադրված է ձեր անհատական QR կոդը։ Ուղեցույցը փակելուց հետո QR կոդի էջը բաց պահեք համակարգչում, իսկ հաջորդ քայլերը կատարեք ձեր անձնական կամ մշտապես ձեզ մոտ գտնվող հեռախոսով։</p><p class="phone-setup-note"><strong>Եթե ծրագիրը բացել եք հենց հեռախոսով՝</strong> ընտրեք այս ուղեցույցի ներքևում ներկայացված <b>Setup key</b> տարբերակը։ Նույն հեռախոսով նրա էկրանին ցուցադրված QR կոդը սկանավորել հնարավոր չէ։</p></div>
        </article>

        <article class="guide-step">
          <div class="guide-copy"><div class="guide-number">2</div><div><h3>Authenticator-ում սեղմեք <b>+</b>, հետո՝ <b>Scan a QR code</b></h3><p>Բացեք Google Authenticator-ը։ Նկարի <b>1</b> սլաքով նշված ներքևի աջ <b>+</b> կոճակը սեղմեք, հետո սեղմեք <b>2</b> սլաքով նշված <b>Scan a QR code</b> տարբերակը։ Եթե առաջին անգամ եք բացում հավելվածը, հնարավոր է նախ պետք լինի սեղմել <b>Get started</b>։</p></div></div>
          <figure><img :src="addAccountImage" alt="Google Authenticator-ի իրական էկրան՝ սլաքներով նշված Plus և Scan a QR code կոճակները"><figcaption>Կարմիր 1 և 2 սլաքները ցույց են տալիս սեղմելու հերթականությունը։</figcaption></figure>
        </article>

        <article class="guide-step">
          <div class="guide-copy"><div class="guide-number">3</div><div><h3>Տեսախցիկով սկանավորեք կայքի QR կոդը</h3><p>Հեռախոսը պահեք համակարգչի էկրանի դիմաց և QR կոդը տեղավորեք գունավոր անկյուններով շրջանակի կենտրոնում։ Ոչինչ նկարելու կամ հաստատելու կարիք չկա. ճիշտ կարդալուց հետո հավելվածն ինքնուրույն կանցնի հաջորդ էջ։</p></div></div>
          <figure class="scan-figure"><img :src="scanCodeImage" alt="Google Authenticator-ի իրական QR սկանավորման էկրանը"><span class="scan-arrow" aria-hidden="true">↓</span><span class="scan-target" aria-hidden="true">QR կոդը պահեք այստեղ</span><figcaption>Եթե տեսախցիկի թույլտվություն հարցնի, ընտրեք «Թույլատրել»։</figcaption></figure>
        </article>

        <article class="guide-step">
          <div class="guide-copy"><div class="guide-number">4</div><div><h3>Գրեք 6-նիշ կոդը և ավարտեք մուտքը</h3><p>Սկանավորումից հետո Authenticator-ի ցանկում կհայտնվի <b>{{ issuer }}</b> անունով տող և 6-նիշ կոդ։ Կոդը փոխվում է մոտավորապես յուրաքանչյուր 30 վայրկյանը մեկ։ Այդ 6 թվերը գրեք կայքի <b>Authenticator կոդ</b> դաշտում և սեղմեք <b>Մուտք գործել</b>։</p></div></div>
          <figure class="code-figure"><img :src="codeImage" alt="Google Authenticator-ի իրական էկրան՝ վեցանիշ կոդերով"><span class="code-arrow" aria-hidden="true">←</span><span class="code-target" aria-hidden="true">Այս 6 թվերը</span><figcaption>Օգտագործեք հենց «{{ issuer }}» տողի կոդը։</figcaption></figure>
        </article>

        <article class="guide-step guide-setup-key-step">
          <div class="guide-copy"><div class="guide-number">A</div><div><h3>Այլ տարբերակ․ ակտիվացում Setup key-ով</h3><p>Օգտագործեք այս տարբերակը, եթե կայքը բացել եք հենց հեռախոսով կամ QR կոդը չի սկանավորվում։ QR-ի տակ սեղմեք <b>Պատճենել</b>, որպեսզի setup key-ը պատճենվի։ Հետո Authenticator-ում կատարեք նկարում ցուցադրված քայլերը։</p><ol class="setup-key-fields"><li><b>+</b> կոճակից ընտրեք <b>Enter a setup key</b>։</li><li><b>Account</b> դաշտում գրեք <code>{{ issuer }}</code>։</li><li><b>Key</b> դաշտում տեղադրեք կայքից պատճենած բանալին։</li><li>Ընտրեք <b>Time-based</b> և սեղմեք <b>Add</b>։</li><li>Հայտնված 6-նիշ կոդը գրեք կայքի <b>Authenticator կոդ</b> դաշտում։</li></ol></div></div>
          <figure class="setup-key-figure"><img :src="setupKeyImage" alt="Google Authenticator-ի իրական էկրաններ՝ Enter a setup key ընտրությունից մինչև Account, Key, Time-based և Add դաշտերը"><figcaption>Ձախ կողմում ընտրեք «Enter a setup key», իսկ աջ կողմում լրացրեք դաշտերը և սեղմեք «Add»։</figcaption></figure>
        </article>
        <p class="guide-warning"><strong>Անվտանգություն․</strong> QR կոդը, setup key-ը և 6-նիշ կոդը ոչ մեկին մի ուղարկեք։</p>
      </div>
    </section>
  </div>
</template>
