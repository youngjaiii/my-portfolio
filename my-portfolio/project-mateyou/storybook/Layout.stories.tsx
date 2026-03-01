import type { Meta, StoryObj } from '@storybook/react'
import { Flex } from '../src/components/Flex'
import { Grid } from '../src/components/Grid'

const meta: Meta = {
  title: 'Components/Layout',
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof meta>

const Box = ({
  children,
  color = 'bg-blue-100',
}: {
  children: React.ReactNode
  color?: string
}) => <div className={`${color} p-4 rounded text-center`}>{children}</div>

export const FlexRow: Story = {
  render: () => (
    <div className="w-96 border border-dashed border-gray-300 p-4">
      <h3 className="text-lg font-semibold mb-4">Flex Row</h3>
      <Flex direction="row" gap={2}>
        <Box>Item 1</Box>
        <Box>Item 2</Box>
        <Box>Item 3</Box>
      </Flex>
    </div>
  ),
}

export const FlexColumn: Story = {
  render: () => (
    <div className="w-96 border border-dashed border-gray-300 p-4">
      <h3 className="text-lg font-semibold mb-4">Flex Column</h3>
      <Flex direction="column" gap={2}>
        <Box>Item 1</Box>
        <Box>Item 2</Box>
        <Box>Item 3</Box>
      </Flex>
    </div>
  ),
}

export const FlexJustifyCenter: Story = {
  render: () => (
    <div className="w-96 border border-dashed border-gray-300 p-4">
      <h3 className="text-lg font-semibold mb-4">Justify Center</h3>
      <Flex justify="center" gap={2}>
        <Box>Item 1</Box>
        <Box>Item 2</Box>
      </Flex>
    </div>
  ),
}

export const FlexJustifyBetween: Story = {
  render: () => (
    <div className="w-96 border border-dashed border-gray-300 p-4">
      <h3 className="text-lg font-semibold mb-4">Justify Between</h3>
      <Flex justify="between">
        <Box>Left</Box>
        <Box>Right</Box>
      </Flex>
    </div>
  ),
}

export const FlexAlignCenter: Story = {
  render: () => (
    <div className="w-96 h-48 border border-dashed border-gray-300 p-4">
      <h3 className="text-lg font-semibold mb-4">Align Center</h3>
      <Flex align="center" gap={2} className="h-32">
        <Box>Tall Item</Box>
        <Box>Small</Box>
      </Flex>
    </div>
  ),
}

export const FlexWithGap: Story = {
  render: () => (
    <div className="w-96 border border-dashed border-gray-300 p-4">
      <h3 className="text-lg font-semibold mb-4">With Large Gap</h3>
      <Flex gap={6}>
        <Box color="bg-red-100">Gap 6</Box>
        <Box color="bg-green-100">Between</Box>
        <Box color="bg-blue-100">Items</Box>
      </Flex>
    </div>
  ),
}

export const GridTwoColumns: Story = {
  render: () => (
    <div className="w-96 border border-dashed border-gray-300 p-4">
      <h3 className="text-lg font-semibold mb-4">Grid - 2 Columns</h3>
      <Grid cols={2} gap={4}>
        <Box>Item 1</Box>
        <Box>Item 2</Box>
        <Box>Item 3</Box>
        <Box>Item 4</Box>
      </Grid>
    </div>
  ),
}

export const GridThreeColumns: Story = {
  render: () => (
    <div className="w-96 border border-dashed border-gray-300 p-4">
      <h3 className="text-lg font-semibold mb-4">Grid - 3 Columns</h3>
      <Grid cols={3} gap={4}>
        <Box color="bg-red-100">1</Box>
        <Box color="bg-green-100">2</Box>
        <Box color="bg-blue-100">3</Box>
        <Box color="bg-yellow-100">4</Box>
        <Box color="bg-purple-100">5</Box>
        <Box color="bg-pink-100">6</Box>
      </Grid>
    </div>
  ),
}

export const GridFourColumns: Story = {
  render: () => (
    <div className="w-96 border border-dashed border-gray-300 p-4">
      <h3 className="text-lg font-semibold mb-4">Grid - 4 Columns</h3>
      <Grid cols={4} gap={2}>
        {Array.from({ length: 8 }, (_, i) => (
          <Box key={i} color={`bg-gray-${((i % 3) + 1) * 100}`}>
            {i + 1}
          </Box>
        ))}
      </Grid>
    </div>
  ),
}

export const GridResponsive: Story = {
  render: () => (
    <div className="w-96 border border-dashed border-gray-300 p-4">
      <h3 className="text-lg font-semibold mb-4">Responsive Grid</h3>
      <Grid cols={1} smCols={2} mdCols={3} lgCols={4} gap={4}>
        {Array.from({ length: 8 }, (_, i) => (
          <Box key={i} color="bg-indigo-100">
            Item {i + 1}
          </Box>
        ))}
      </Grid>
    </div>
  ),
}

export const GridWithGap: Story = {
  render: () => (
    <div className="w-96 border border-dashed border-gray-300 p-4">
      <h3 className="text-lg font-semibold mb-4">Grid - Large Gap</h3>
      <Grid cols={2} gap={8}>
        <Box color="bg-orange-100">Large Gap</Box>
        <Box color="bg-teal-100">Between Items</Box>
      </Grid>
    </div>
  ),
}

export const LayoutShowcase: Story = {
  render: () => (
    <div className="space-y-8 p-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold mb-4 text-blue-600">Flex Layouts</h2>
        <div className="space-y-6">
          <div>
            <h4 className="text-lg font-semibold mb-2">Justify Between</h4>
            <Flex justify="between" className="bg-gray-100 p-3 rounded">
              <Box>Left</Box>
              <Box>Right</Box>
            </Flex>
          </div>
          <div>
            <h4 className="text-lg font-semibold mb-2">Center with Gap</h4>
            <Flex justify="center" gap={4} className="bg-gray-100 p-3 rounded">
              <Box color="bg-green-100">Item 1</Box>
              <Box color="bg-yellow-100">Item 2</Box>
              <Box color="bg-purple-100">Item 3</Box>
            </Flex>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold mb-4 text-blue-600">Grid Layouts</h2>
        <div className="space-y-6">
          <div>
            <h4 className="text-lg font-semibold mb-2">3 Columns</h4>
            <Grid cols={3} gap={2} className="bg-gray-100 p-3 rounded">
              {Array.from({ length: 6 }, (_, i) => (
                <Box key={i} color="bg-blue-100">
                  {i + 1}
                </Box>
              ))}
            </Grid>
          </div>
          <div>
            <h4 className="text-lg font-semibold mb-2">4 Columns</h4>
            <Grid cols={4} gap={1} className="bg-gray-100 p-3 rounded">
              {Array.from({ length: 8 }, (_, i) => (
                <Box key={i} color="bg-green-100">
                  {i + 1}
                </Box>
              ))}
            </Grid>
          </div>
        </div>
      </div>
    </div>
  ),
}
