import { Actor } from 'apify';
import { CheerioCrawler } from 'crawlee';

await Actor.init();

const input = await Actor.getInput() || {};
const linkedinUrl = input.linkedinUrl;
const maxItems = input.maxItems || 1000;

if (!linkedinUrl) {
    throw new Error('linkedinUrl is required!');
}

// Valider l'URL
if (!linkedinUrl.includes('linkedin.com/jobs/search')) {
    throw new Error('Invalid LinkedIn jobs search URL. Must contain "linkedin.com/jobs/search"');
}

console.log('Input configuration:', {
    linkedinUrl,
    maxItems
});

// Classe pour nettoyer le HTML
class HtmlTextExtractor {
    static extractText(html) {
        if (!html || typeof html !== 'string') return '';
        let text = html;
        text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
        text = text.replace(/<!--[\s\S]*?-->/g, '');
        text = text.replace(/<[^>]+>/g, ' ');
        text = text.replace(/&nbsp;/g, ' ');
        text = text.replace(/&amp;/g, '&');
        text = text.replace(/&lt;/g, '<');
        text = text.replace(/&gt;/g, '>');
        text = text.replace(/&quot;/g, '"');
        text = text.replace(/&#39;/g, "'");
        text = text.replace(/\s+/g, ' ');
        return text.trim();
    }
}

// Classe pour parser les jobs LinkedIn
class LinkedInJobParser {
    static parseJob(jobHtml) {
        const job = {
            id: null,
            title: null,
            company: null,
            location: null,
            postedTime: null,
            postedDate: null,
            applyUrl: null,
            companyUrl: null,
            benefits: [],
            scrapedAt: new Date().toISOString()
        };

        const urnMatch = jobHtml.match(/data-entity-urn="urn:li:jobPosting:(\d+)"/);
        if (urnMatch) job.id = urnMatch[1];

        const titleMatch = jobHtml.match(/<h3[^>]*class="base-search-card__title"[^>]*>\s*([\s\S]*?)\s*<\/h3>/);
        if (titleMatch) job.title = HtmlTextExtractor.extractText(titleMatch[1]).trim();

        const companyMatch = jobHtml.match(/<h4[^>]*class="base-search-card__subtitle"[^>]*>([\s\S]*?)<\/h4>/);
        if (companyMatch) {
            job.company = HtmlTextExtractor.extractText(companyMatch[1]).trim();
            const companyUrlMatch = companyMatch[1].match(/href="([^"]+)"/);
            if (companyUrlMatch) job.companyUrl = companyUrlMatch[1];
        }

        const locationMatch = jobHtml.match(/<span[^>]*class="job-search-card__location"[^>]*>\s*(.*?)\s*<\/span>/);
        if (locationMatch) job.location = HtmlTextExtractor.extractText(locationMatch[1]).trim();

        const timeMatch = jobHtml.match(/<time[^>]*datetime="([^"]*)"[^>]*>([\s\S]*?)<\/time>/);
        if (timeMatch) {
            job.postedDate = timeMatch[1];
            job.postedTime = HtmlTextExtractor.extractText(timeMatch[2]).trim();
        }

        // Extraction du lien - Plusieurs méthodes
        let foundUrl = null;
        
        // Méthode 1: base-card__full-link
        const method1 = jobHtml.match(/<a[^>]*class="[^"]*base-card__full-link[^"]*"[^>]*href="([^"]+)"/);
        if (method1) foundUrl = method1[1];
        
        // Méthode 2: Premier <a> qui pointe vers /jobs/view/
        if (!foundUrl) {
            const method2 = jobHtml.match(/<a[^>]*href="([^"]*\/jobs\/view\/[^"]+)"/);
            if (method2) foundUrl = method2[1];
        }
        
        // Méthode 3: Recherche directe du pattern d'URL
        if (!foundUrl) {
            const method3 = jobHtml.match(/https?:\/\/[^\s"]*linkedin\.com\/jobs\/view\/[^\s"]+/);
            if (method3) foundUrl = method3[0];
        }
        
        if (foundUrl) {
            job.applyUrl = foundUrl.replace(/&amp;/g, '&');
        }
        
        // Si aucune URL trouvée, la construire
        if (!job.applyUrl && job.id) {
            job.applyUrl = this.constructLinkedInUrl(job.title, job.company, job.id);
        }

        const benefitsMatch = jobHtml.match(/<span[^>]*class="job-posting-benefits__text"[^>]*>([\s\S]*?)<\/span>/g);
        if (benefitsMatch) {
            job.benefits = benefitsMatch.map(b => HtmlTextExtractor.extractText(b).trim());
        }

        return job;
    }

    static constructLinkedInUrl(title, company, jobId) {
        const titleSlug = title 
            ? title.toLowerCase()
                .replace(/[^\w\s-]/g, '')
                .replace(/\s+/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-|-$/g, '')
                .substring(0, 80)
            : 'job';
        
        const companySlug = company
            ? company.toLowerCase()
                .replace(/[^\w\s-]/g, '')
                .replace(/\s+/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-|-$/g, '')
                .substring(0, 40)
            : 'company';
        
        return `https://www.linkedin.com/jobs/view/${titleSlug}-at-${companySlug}-${jobId}`;
    }

    static parseJobsPage(pageHtml) {
        const jobs = [];
        const jobPattern = /<li>\s*(?:(?!<\/li>).)*?data-entity-urn="urn:li:jobPosting:\d+"(?:(?!<\/li>).)*?<\/li>/gs;
        const jobMatches = pageHtml.match(jobPattern);

        if (jobMatches) {
            for (const jobHtml of jobMatches) {
                const job = this.parseJob(jobHtml);
                if (job.id) jobs.push(job);
            }
        }

        return jobs;
    }
}

// Convertir l'URL de recherche en URLs paginées
function generatePaginatedUrls(baseUrl, maxPages) {
    const urls = [];
    
    // Parser l'URL de base
    const url = new URL(baseUrl);
    
    // Convertir en URL API si c'est une URL de recherche normale
    let apiBaseUrl;
    if (baseUrl.includes('/jobs-guest/jobs/api/seeMoreJobPostings/search')) {
        // Déjà une URL API
        apiBaseUrl = baseUrl.split('?')[0];
    } else {
        // Convertir en URL API
        apiBaseUrl = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';
    }
    
    // Extraire les paramètres
    const params = new URLSearchParams(url.search);
    
    // Supprimer les paramètres de pagination existants
    params.delete('start');
    params.delete('position');
    params.delete('pageNum');
    
    // Générer les URLs paginées
    for (let i = 0; i < maxPages; i++) {
        const start = i * 25;
        const newParams = new URLSearchParams(params);
        newParams.set('start', start.toString());
        
        urls.push({
            url: `${apiBaseUrl}?${newParams.toString()}`,
            userData: { page: i + 1, start }
        });
    }
    
    return urls;
}

// Générer toutes les URLs à scraper
const maxPages = Math.min(Math.ceil(maxItems / 25), 40);
const startUrls = generatePaginatedUrls(linkedinUrl, maxPages);

console.log(`Generated ${startUrls.length} URLs to scrape`);
console.log(`First URL: ${startUrls[0].url}`);

// Configuration du proxy
let proxyConfiguration;
if (input.proxyConfiguration) {
    proxyConfiguration = await Actor.createProxyConfiguration(input.proxyConfiguration);
} else {
    proxyConfiguration = await Actor.createProxyConfiguration({
        groups: ['RESIDENTIAL']
    });
}

let totalJobsCollected = 0;
const emptyPagesByStart = new Map();

const crawler = new CheerioCrawler({
    proxyConfiguration,
    maxRequestsPerCrawl: maxPages,
    
    maxConcurrency: 3,
    minConcurrency: 1,
    
    requestHandlerTimeoutSecs: 30,
    navigationTimeoutSecs: 30,
    
    maxRequestRetries: 2,
    maxRequestsPerMinute: 120,
    
    async requestHandler({ request, body, crawler }) {
        const { page, start } = request.userData;
        
        const html = body.toString();

        if (!html || html.length < 100) {
            console.log(`Page ${page} (start=${start}): Empty response`);
            emptyPagesByStart.set(start, true);
            return;
        }

        const jobs = LinkedInJobParser.parseJobsPage(html);
        console.log(`Page ${page} (start=${start}): Found ${jobs.length} jobs | Total collected: ${totalJobsCollected}`);

        if (jobs.length === 0) {
            console.log(`Page ${page} (start=${start}): No jobs found`);
            emptyPagesByStart.set(start, true);
            
            const previousStart = start - 25;
            
            if (emptyPagesByStart.has(previousStart) && emptyPagesByStart.get(previousStart)) {
                console.log(`Detected 2 consecutive empty pages at start=${previousStart} and start=${start}`);
                console.log('Stopping crawler...');
                await crawler.autoscaledPool?.abort();
                return;
            }
            
            return;
        }

        emptyPagesByStart.set(start, false);

        for (const job of jobs) {
            await Actor.pushData(job);
            totalJobsCollected++;

            if (totalJobsCollected >= maxItems) {
                console.log(`Reached maxItems limit: ${maxItems}`);
                console.log('Stopping crawler...');
                await crawler.autoscaledPool?.abort();
                return;
            }
        }
    },

    failedRequestHandler({ request, error }) {
        console.log(`Page ${request.userData.page} failed: ${error.message}`);
    },
});

console.log('Starting crawler...');
await crawler.run(startUrls);

console.log(`✅ Scraping completed! Total jobs collected: ${totalJobsCollected}`);

await Actor.exit();
