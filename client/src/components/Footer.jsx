// Footer del menu publico. Contiene cuatro columnas:
//   1. Brand: logo + tagline (y redes en mobile)
//   2. Info: contacto + horarios + badge "abierto/cerrado" en vivo
//   3. Links: navegacion interna + redes (en desktop)
//   4. Mapa de Google embebido

import restaurantConfig from "../config/restaurant";
import { useRestaurantOpenStatus } from "../hooks/useRestaurantOpenStatus";
import styles from "./Footer.module.css";
import { IconFacebook } from "./icons/IconFacebook";
import { IconInstagram } from "./icons/IconInstagram";

// Subcomponente: el bloque de redes sociales se renderea dos veces (una en
// mobile dentro de la columna brand, otra en desktop dentro de Links). CSS
// oculta cada bloque segun el viewport.
function SocialList({ links }) {
  return (
    <ul className={styles.socialList} aria-label="Redes sociales">
      {links.map((social) => (
        <li key={social.name}>
          <a href={social.url} target="_blank" rel="noreferrer" className={styles.socialItem}>
            <span className={styles.socialIcon} aria-hidden="true">
              {social.icon}
            </span>
            <span>{social.name}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function Footer() {
  const { isOpen } = useRestaurantOpenStatus();

  const socialLinks = [
    { name: "Instagram", url: restaurantConfig.social.instagram, icon: <IconInstagram /> },
    { name: "Facebook", url: restaurantConfig.social.facebook, icon: <IconFacebook /> },
  ];

  return (
    <footer className={styles.siteFooter} id="footer">
      <div className={styles.footerBrandCol}>
        <img
          className={styles.footerLogo}
          src={restaurantConfig.links.logo}
          alt={`Logo ${restaurantConfig.name}`}
        />
        <p className={styles.footerTagline}>{restaurantConfig.tagline}</p>
        <div className={styles.socialListMobile}>
          <SocialList links={socialLinks} />
        </div>
      </div>

      <div className={styles.footerInfoCol}>
        <section className={styles.footerBlock}>
          <h5>Contacto</h5>
          <ul className={styles.footerContactList}>
            <li>{restaurantConfig.contact.address}</li>
            <li>{restaurantConfig.contact.phone}</li>
            <li>{restaurantConfig.contact.email}</li>
          </ul>
        </section>

        <section className={styles.footerBlock}>
          <div className={styles.hoursHeader}>
            <h5 className={styles.footerSubtitle}>Horarios</h5>
            <span
              className={`${styles.statusBadge} ${isOpen ? styles.statusOpen : styles.statusClosed}`}
            >
              <span className={styles.statusDot} />
              {isOpen ? "Abierto" : "Cerrado"}
            </span>
          </div>
          <ul className={styles.footerHoursList}>
            {restaurantConfig.hours.map((h) => (
              <li key={h.days}>
                {h.days}: {h.time}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className={styles.footerLinksCol}>
        <section className={styles.footerBlock}>
          <h5>Enlaces</h5>
          <ul className={styles.footerLinksList}>
            <li>
              <a href="#menu">Nuestra carta</a>
            </li>
            <li>
              <a href="#reservas">Reservas</a>
            </li>
            <li>
              <a href="#footer">Sobre nosotros</a>
            </li>
            <li>
              <a href={restaurantConfig.links.delivery} target="_blank" rel="noreferrer">
                Delivery
              </a>
            </li>
          </ul>
        </section>

        <section className={styles.footerBlock}>
          <h5 className={styles.footerSubtitle}>Redes</h5>
          <SocialList links={socialLinks} />
        </section>
      </div>

      <div className={styles.footerMapCol}>
        <h5>Ubicacion</h5>
        <div className={styles.footerMapFrame}>
          <iframe
            title={`Mapa ${restaurantConfig.name}`}
            src={restaurantConfig.links.mapEmbed}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </div>

      <div className={styles.footerBottom}>2026 Route 66 ©</div>
    </footer>
  );
}

export default Footer;
