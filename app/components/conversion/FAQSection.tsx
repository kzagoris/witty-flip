import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion'
import type { ConversionFAQ } from '~/lib/conversions'

export function FAQSection({ faqs }: { faqs: ConversionFAQ[] }) {
  if (faqs.length === 0) return null

  return (
    <section className="mt-16 sm:mt-20">
      <h2 className="font-heading text-xl font-medium">Frequently Asked Questions</h2>
      <Accordion type="single" collapsible className="mt-4 w-full">
        {faqs.map((faq, i) => (
          <AccordionItem key={i} value={`faq-${i}`}>
            <AccordionTrigger>{faq.question}</AccordionTrigger>
            <AccordionContent>
              <p className="text-muted-foreground">{faq.answer}</p>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  )
}
