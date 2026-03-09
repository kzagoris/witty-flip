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
    <section className="mt-10">
      <h2 className="mb-4 font-heading text-2xl font-bold">Frequently Asked Questions</h2>
      <Accordion type="single" collapsible className="w-full">
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
