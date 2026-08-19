const { createApp } = Vue;

createApp({
  data() {
    return {
      locale: "en",
      translations: {
        en: {
          app: {
            title: "Portfolio Tracker",
            subtitle: "Manage your holdings and sync them with the REST API.",
            languageLabel: "Language",
            languages: {
              en: "English",
              fr: "French",
            },
          },
          form: {
            title: "Add a position",
            expandButton: "Expand",
            collapseButton: "Collapse",
            searchLabel: "Search on Yahoo Finance",
            searchPlaceholder: "Type a company name or symbol",
            searching: "Searching...",
            symbolLabel: "Symbol",
            symbolPlaceholder: "Example: TTE.PA",
            nameLabel: "Display name",
            namePlaceholder: "Example: TotalEnergies SE",
            sharesLabel: "Shares",
            sharesPlaceholder: "Example: 12",
            addButton: "Add position",
            resetButton: "Reset",
            helper: "Tip: click a search result to fill in the symbol and name automatically.",
          },
          portfolio: {
            title: "Current portfolio",
            subtitle: "Review, remove, save, and refresh your saved positions.",
            loading: "Loading portfolio...",
            empty: "No positions yet. Add one from the form on the left.",
            removeButton: "Remove",
            shares: "Shares",
            marketPrice: "Market price",
            marketValue: "Market value",
            saveButton: "Save portfolio",
            saving: "Saving...",
            refreshButton: "Refresh",
          },
          summary: {
            positions: "Positions",
            value: "Estimated value",
          },
          messages: {
            loadSuccess: "Portfolio loaded successfully.",
            saveSuccess: "Portfolio saved successfully.",
            addSuccess: "Position added locally. Save to persist changes.",
            removeSuccess: "Position removed locally. Save to persist changes.",
            searchError: "Search failed.",
            loadError: "Failed to load portfolio.",
            saveError: "Failed to save portfolio.",
            invalidForm: "Please provide a symbol and a valid share quantity.",
          },
          common: {
            notAvailable: "N/A",
          },
        },
        fr: {
          app: {
            title: "Suivi de portefeuille",
            subtitle: "Gérez vos positions et synchronisez-les avec l'API REST.",
            languageLabel: "Langue",
            languages: {
              en: "Anglais",
              fr: "Français",
            },
          },
          form: {
            title: "Ajouter une position",
            expandButton: "Développer",
            collapseButton: "Réduire",
            searchLabel: "Rechercher sur Yahoo Finance",
            searchPlaceholder: "Saisissez un nom d'entreprise ou un symbole",
            searching: "Recherche en cours...",
            symbolLabel: "Symbole",
            symbolPlaceholder: "Exemple : TTE.PA",
            nameLabel: "Nom d'affichage",
            namePlaceholder: "Exemple : TotalEnergies SE",
            sharesLabel: "Quantité",
            sharesPlaceholder: "Exemple : 12",
            addButton: "Ajouter la position",
            resetButton: "Réinitialiser",
            helper: "Astuce : cliquez sur un résultat de recherche pour remplir automatiquement le symbole et le nom.",
          },
          portfolio: {
            title: "Portefeuille actuel",
            subtitle: "Consultez, supprimez, enregistrez et actualisez vos positions sauvegardées.",
            loading: "Chargement du portefeuille...",
            empty: "Aucune position pour le moment. Ajoutez-en une depuis le formulaire à gauche.",
            removeButton: "Supprimer",
            shares: "Quantité",
            marketPrice: "Cours du marché",
            marketValue: "Valeur de marché",
            saveButton: "Enregistrer le portefeuille",
            saving: "Enregistrement...",
            refreshButton: "Actualiser",
          },
          summary: {
            positions: "Positions",
            value: "Valeur estimée",
          },
          messages: {
            loadSuccess: "Portefeuille chargé avec succès.",
            saveSuccess: "Portefeuille enregistré avec succès.",
            addSuccess: "Position ajoutée localement. Enregistrez pour conserver les modifications.",
            removeSuccess: "Position supprimée localement. Enregistrez pour conserver les modifications.",
            searchError: "La recherche a échoué.",
            loadError: "Échec du chargement du portefeuille.",
            saveError: "Échec de l'enregistrement du portefeuille.",
            invalidForm: "Veuillez fournir un symbole et une quantité valide.",
          },
          common: {
            notAvailable: "N/D",
          },
        },
      },
      positions: [],
      form: {
        symbol: "",
        name: "",
        shares: null,
      },
      message: {
        type: "success",
        text: "",
      },
      searchQuery: "",
      searchResults: [],
      isSearching: false,
      isFormExpanded: false,
      isLoading: false,
      isSaving: false,
      searchTimeoutId: null,
    };
  },
  computed: {
    totalMarketValue() {
      return this.positions.reduce((sum, position) => {
        const value = Number(position.marketValue);
        return sum + (Number.isFinite(value) ? value : 0);
      }, 0);
    },
    summaryCurrency() {
      return this.positions.find((position) => position.currency)?.currency || "EUR";
    },
  },
  methods: {
    detectLocale() {
      const availableLocales = Object.keys(this.translations);
      const browserLocales = Array.isArray(navigator.languages) && navigator.languages.length > 0
        ? navigator.languages
        : [navigator.language];

      for (const locale of browserLocales) {
        if (availableLocales.includes(locale)) {
          return locale;
        }

        const primaryLocale = String(locale || "").split("-")[0];
        if (availableLocales.includes(primaryLocale)) {
          return primaryLocale;
        }
      }

      return "en";
    },
    t(key) {
      return key.split(".").reduce((value, segment) => value?.[segment], this.translations[this.locale]) || key;
    },
    setMessage(type, text) {
      this.message = { type, text };
      window.clearTimeout(this.messageTimeoutId);
      this.messageTimeoutId = window.setTimeout(() => {
        this.message.text = "";
      }, 3000);
    },
    formatNumber(value) {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        return this.t("common.notAvailable");
      }

      return new Intl.NumberFormat(this.locale, {
        maximumFractionDigits: 4,
      }).format(number);
    },
    formatCurrency(value, currency = "EUR") {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        return this.t("common.notAvailable");
      }

      return new Intl.NumberFormat(this.locale, {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(number);
    },
    normalizePosition(position) {
      return {
        symbol: String(position.symbol || "").trim().toUpperCase(),
        name: String(position.name || "").trim(),
        shares: Number(position.shares || 0),
        marketPrice: position.marketPrice ?? null,
        marketValue: position.marketValue ?? null,
        currency: position.currency || "EUR",
        quoteName: position.quoteName || position.name || position.symbol || "",
        url: position.url
      };
    },
    resetForm() {
      this.form = {
        symbol: "",
        name: "",
        shares: null,
      };
      this.searchQuery = "";
      this.searchResults = [];
    },
    toggleFormExpanded() {
      this.isFormExpanded = !this.isFormExpanded;
    },
    selectSearchResult(result) {
      this.form.symbol = result.symbol || "";
      this.form.name = result.name || "";
      this.searchQuery = result.name || result.symbol || "";
      this.searchResults = [];
      this.isFormExpanded = true;
    },
    async handleSearchInput() {
      window.clearTimeout(this.searchTimeoutId);

      if (!this.searchQuery || this.searchQuery.length < 2) {
        this.searchResults = [];
        this.isSearching = false;
        return;
      }

      this.searchTimeoutId = window.setTimeout(async () => {
        this.isSearching = true;
        try {
          const response = await fetch(`/api/search?q=${encodeURIComponent(this.searchQuery)}`);
          if (!response.ok) {
            throw new Error("Search request failed");
          }

          const data = await response.json();
          this.searchResults = Array.isArray(data.results) ? data.results : [];
        } catch {
          this.searchResults = [];
          this.setMessage("error", this.t("messages.searchError"));
        } finally {
          this.isSearching = false;
        }
      }, 300);
    },
    addPosition() {
      const position = this.normalizePosition(this.form);
      if (!position.symbol || !Number.isFinite(position.shares) || position.shares <= 0) {
        this.setMessage("error", this.t("messages.invalidForm"));
        return;
      }

      this.positions.unshift(position);
      this.resetForm();
      this.setMessage("success", this.t("messages.addSuccess"));
    },
    removePosition(index) {
      this.positions.splice(index, 1);
      this.setMessage("success", this.t("messages.removeSuccess"));
    },
    async loadPortfolio(showSuccessMessage = true) {
      this.isLoading = true;
      try {
        const response = await fetch("/api/portfolio");
        if (!response.ok) {
          throw new Error("Load request failed");
        }

        const data = await response.json();
        this.positions = Array.isArray(data.positions)
          ? data.positions.map((position) => this.normalizePosition(position))
          : [];

        if (showSuccessMessage) {
          this.setMessage("success", this.t("messages.loadSuccess"));
        }
      } catch {
        this.setMessage("error", this.t("messages.loadError"));
      } finally {
        this.isLoading = false;
      }
    },
    async savePortfolio() {
      this.isSaving = true;
      try {
        const payload = {
          positions: this.positions.map((position) => ({
            symbol: position.symbol,
            name: position.name,
            shares: position.shares,
          })),
        };

        const response = await fetch("/api/portfolio", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error("Save request failed");
        }

        const data = await response.json();
        this.positions = Array.isArray(data.positions)
          ? data.positions.map((position) => this.normalizePosition(position))
          : [];

        this.setMessage("success", this.t("messages.saveSuccess"));
      } catch {
        this.setMessage("error", this.t("messages.saveError"));
      } finally {
        this.isSaving = false;
      }
    },
  },
  mounted() {
    this.locale = this.detectLocale();
    this.loadPortfolio(false);
  },
}).mount("#app");
