import type { Meta, StoryObj } from '@storybook/react'
import { StarRating } from '../src/components/StarRating'

const meta: Meta<typeof StarRating> = {
  title: 'Components/StarRating',
  component: StarRating,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    rating: {
      control: { type: 'range', min: 0, max: 5, step: 0.1 },
    },
    size: {
      control: { type: 'select' },
      options: ['sm', 'md', 'lg', 'xl'],
    },
    showRating: {
      control: { type: 'boolean' },
    },
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    rating: 4.5,
  },
}

export const Small: Story = {
  args: {
    rating: 3.5,
    size: 'sm',
  },
}

export const Large: Story = {
  args: {
    rating: 4.8,
    size: 'lg',
  },
}

export const ExtraLarge: Story = {
  args: {
    rating: 4.2,
    size: 'lg',
  },
}

export const WithRatingText: Story = {
  args: {
    rating: 4.7,
    showRating: true,
  },
}

export const Interactive: Story = {
  args: {
    rating: 3,
    readonly: false,
    onChange: (rating: number) => {},
  },
}

export const ZeroRating: Story = {
  args: {
    rating: 0,
    showRating: true,
  },
}

export const PerfectRating: Story = {
  args: {
    rating: 5,
    showRating: true,
  },
}

export const HalfStars: Story = {
  render: () => (
    <div className="space-y-4 p-6">
      <h3 className="text-lg font-semibold mb-4">Half Star Ratings</h3>
      <div className="space-y-3">
        <div>
          <p className="text-sm mb-2">0.5 stars</p>
          <StarRating rating={0.5} showRating />
        </div>
        <div>
          <p className="text-sm mb-2">1.5 stars</p>
          <StarRating rating={1.5} showRating />
        </div>
        <div>
          <p className="text-sm mb-2">2.5 stars</p>
          <StarRating rating={2.5} showRating />
        </div>
        <div>
          <p className="text-sm mb-2">3.5 stars</p>
          <StarRating rating={3.5} showRating />
        </div>
        <div>
          <p className="text-sm mb-2">4.5 stars</p>
          <StarRating rating={4.5} showRating />
        </div>
      </div>
    </div>
  ),
}

export const AllSizes: Story = {
  render: () => (
    <div className="space-y-4 p-6">
      <h3 className="text-lg font-semibold mb-4">Different Sizes</h3>
      <div className="space-y-3">
        <div className="flex items-center gap-4">
          <span className="w-16 text-sm">Small:</span>
          <StarRating rating={4.5} size="sm" showRating />
        </div>
        <div className="flex items-center gap-4">
          <span className="w-16 text-sm">Medium:</span>
          <StarRating rating={4.5} size="md" showRating />
        </div>
        <div className="flex items-center gap-4">
          <span className="w-16 text-sm">Large:</span>
          <StarRating rating={4.5} size="lg" showRating />
        </div>
        <div className="flex items-center gap-4">
          <span className="w-16 text-sm">X-Large:</span>
          <StarRating rating={4.5} size="lg" showRating />
        </div>
      </div>
    </div>
  ),
}
